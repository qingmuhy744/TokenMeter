from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select

from backend.database import async_session
from backend.models import TokenPlan, TestResult

router = APIRouter(prefix="/api/public", tags=["public"])


def _is_unavailable(error: str | None) -> bool:
    """Check if an error indicates the service is unavailable (including 429/overload)."""
    if not error:
        return False
    error_lower = error.lower()
    return any(kw in error_lower for kw in [
        "429", "529", "overload", "rate limit", "too many",
        "unavailable", "503", "502", "timeout",
    ])


def _range_to_timedelta(range_str: str) -> timedelta:
    return {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}.get(range_str, timedelta(hours=24))


@router.get("/status")
async def public_status(range: str = Query("24h", pattern="^(24h|7d|30d)$")):
    since = datetime.now(timezone.utc) - _range_to_timedelta(range)

    async with async_session() as db:
        # Get active plans
        plans_result = await db.execute(
            select(TokenPlan).where(TokenPlan.is_active == True).order_by(TokenPlan.id)  # noqa: E712
        )
        plans = plans_result.scalars().all()

        plan_data = []
        for plan in plans:
            # Latest result
            latest_result = await db.execute(
                select(TestResult)
                .where(TestResult.plan_id == plan.id)
                .order_by(TestResult.created_at.desc())
                .limit(1)
            )
            latest = latest_result.scalar_one_or_none()

            # All results in range for availability and stats
            range_results = await db.execute(
                select(TestResult)
                .where(TestResult.plan_id == plan.id)
                .where(TestResult.created_at >= since)
                .order_by(TestResult.created_at.desc())
            )
            all_in_range = range_results.scalars().all()

            # Availability: success = no error AND not overloaded
            total_count = len(all_in_range)
            if total_count > 0:
                success_count = sum(1 for r in all_in_range if r.error is None and not _is_unavailable(r.error))
                availability_pct = round(success_count / total_count * 100, 1)
            else:
                availability_pct = None

            # Stats (only successful tests, exclude overloaded)
            successful = [r for r in all_in_range if r.error is None and r.tps_overall is not None]
            if successful:
                ttfts = sorted([r.ttft_ms for r in successful if r.ttft_ms is not None])
                tps_list = sorted([r.tps_overall for r in successful])
                avg_ttft = round(sum(ttfts) / len(ttfts)) if ttfts else None
                avg_tps = round(sum(tps_list) / len(tps_list), 1) if tps_list else None
                p95_ttft = ttfts[int(len(ttfts) * 0.95)] if ttfts else None
                stats = {
                    "avg_ttft_ms": avg_ttft,
                    "avg_tps_overall": avg_tps,
                    "p95_ttft_ms": round(p95_ttft) if p95_ttft else None,
                    "count": len(successful),
                }
            else:
                stats = {"avg_ttft_ms": None, "avg_tps_overall": None, "p95_ttft_ms": None, "count": 0}

            # Trend data (successful tests only)
            trend_results = await db.execute(
                select(TestResult)
                .where(TestResult.plan_id == plan.id)
                .where(TestResult.error.is_(None))
                .where(TestResult.created_at >= since)
                .order_by(TestResult.created_at.asc())
            )
            trend_items = trend_results.scalars().all()

            latest_data = None
            if latest:
                latest_data = {
                    "ttft_ms": round(latest.ttft_ms) if latest.ttft_ms else None,
                    "tps_overall": round(latest.tps_overall, 1) if latest.tps_overall else None,
                    "error": latest.error,
                    "is_unavailable": _is_unavailable(latest.error),
                    "created_at": latest.created_at.isoformat() + "Z",
                }

            plan_data.append({
                "id": plan.id,
                "name": plan.name,
                "model": plan.model,
                "api_type": plan.api_type,
                "is_active": plan.is_active,
                "latest_result": latest_data,
                "availability_pct": availability_pct,
                "stats": stats,
                "trend": [
                    {
                        "time": r.created_at.isoformat() + "Z",
                        "tps_overall": round(r.tps_overall, 1) if r.tps_overall else None,
                        "ttft_ms": round(r.ttft_ms) if r.ttft_ms else None,
                    }
                    for r in trend_items
                ],
            })

    return {"plans": plan_data, "range": range}
