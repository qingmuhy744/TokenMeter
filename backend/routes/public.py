from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from backend.database import async_session
from backend.models import TokenPlan, TestResult, Setting

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


def _get_bucket_config(range_str: Literal["24h", "7d", "30d"]) -> tuple[int, int]:
    """Returns (bucket_ms, min_interval_ms) for given range."""
    configs = {
        "24h": (10 * 60 * 1000, 10 * 60 * 1000),      # 10min bucket, 10min min interval
        "7d": (60 * 60 * 1000, 60 * 60 * 1000),       # 1hr bucket, 1hr min interval
        "30d": (6 * 60 * 60 * 1000, 6 * 60 * 60 * 1000),  # 6hr bucket, 6hr min interval
    }
    return configs.get(range_str, configs["24h"])


def _bin_timestamp(ts: datetime, bucket_ms: int) -> datetime:
    """Floor timestamp to bucket boundary."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    ms = int(ts.timestamp() * 1000)
    floored = (ms // bucket_ms) * bucket_ms
    return datetime.fromtimestamp(floored / 1000, tz=timezone.utc)


def _aggregate_trend_data(items: list[TestResult], bucket_ms: int, min_interval_ms: int) -> list[dict]:
    """
    Aggregate test results into time buckets.
    If test interval > min_interval_ms, auto-increase bucket size.
    Returns list of {time, tps_overall, ttft_ms} with bucketed timestamps.
    """
    if not items:
        return []

    # Group by bucket
    buckets: dict[datetime, list[TestResult]] = {}
    for item in items:
        bucket_ts = _bin_timestamp(item.created_at, bucket_ms)
        if bucket_ts not in buckets:
            buckets[bucket_ts] = []
        buckets[bucket_ts].append(item)

    # Detect actual max interval and adjust bucket if needed
    sorted_times = sorted(buckets.keys())
    if len(sorted_times) >= 2:
        max_interval = max((sorted_times[i+1] - sorted_times[i]).total_seconds() * 1000
                           for i in range(len(sorted_times) - 1))
        if max_interval > min_interval_ms:
            # Find a bucket that fits: lcm-ish approach, use max_interval rounded up
            new_bucket = bucket_ms
            while new_bucket < max_interval:
                new_bucket *= 2
            bucket_ms = new_bucket
            # Re-bin
            buckets = {}
            for item in items:
                bucket_ts = _bin_timestamp(item.created_at, bucket_ms)
                if bucket_ts not in buckets:
                    buckets[bucket_ts] = []
                buckets[bucket_ts].append(item)

    # Aggregate each bucket (median)
    result = []
    for bucket_ts in sorted(buckets.keys()):
        group = buckets[bucket_ts]
        ttfts = [r.ttft_ms for r in group if r.ttft_ms is not None]
        tps_list = [r.tps_overall for r in group if r.tps_overall is not None]

        median_ttft = sorted(ttfts)[len(ttfts) // 2] if ttfts else None
        median_tps = sorted(tps_list)[len(tps_list) // 2] if tps_list else None
        tps_gen_list = [r.tps_generate for r in group if r.tps_generate is not None]
        median_tps_gen = sorted(tps_gen_list)[len(tps_gen_list) // 2] if tps_gen_list else None

        result.append({
            "time": bucket_ts.isoformat().replace("+00:00", "Z"),
            "tps_overall": round(median_tps, 1) if median_tps is not None else None,
            "tps_generate": round(median_tps_gen, 1) if median_tps_gen is not None else None,
            "ttft_ms": round(median_ttft) if median_ttft is not None else None,
        })

    return result


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
                tps_gen_list = sorted([r.tps_generate for r in successful if r.tps_generate is not None])
                avg_ttft = round(sum(ttfts) / len(ttfts)) if ttfts else None
                avg_tps = round(sum(tps_list) / len(tps_list), 1) if tps_list else None
                avg_tps_gen = round(sum(tps_gen_list) / len(tps_gen_list), 1) if tps_gen_list else None
                p95_ttft = ttfts[int(len(ttfts) * 0.95)] if ttfts else None
                stats = {
                    "avg_ttft_ms": avg_ttft,
                    "avg_tps_overall": avg_tps,
                    "avg_tps_generate": avg_tps_gen,
                    "p95_ttft_ms": round(p95_ttft) if p95_ttft else None,
                    "count": len(successful),
                }
            else:
                stats = {"avg_ttft_ms": None, "avg_tps_overall": None, "avg_tps_generate": None, "p95_ttft_ms": None, "count": 0}

            # Trend data (successful tests only, aggregated into time buckets)
            trend_results = await db.execute(
                select(TestResult)
                .where(TestResult.plan_id == plan.id)
                .where(TestResult.error.is_(None))
                .where(TestResult.created_at >= since)
                .order_by(TestResult.created_at.asc())
            )
            trend_items = trend_results.scalars().all()

            bucket_ms, min_interval_ms = _get_bucket_config(range)
            trend = _aggregate_trend_data(trend_items, bucket_ms, min_interval_ms)

            latest_data = None
            if latest:
                latest_at = latest.created_at
                if latest_at.tzinfo is None:
                    latest_at = latest_at.replace(tzinfo=timezone.utc)
                latest_data = {
                    "ttft_ms": round(latest.ttft_ms) if latest.ttft_ms else None,
                    "tps_overall": round(latest.tps_overall, 1) if latest.tps_overall else None,
                    "tps_generate": round(latest.tps_generate, 1) if latest.tps_generate else None,
                    "error": latest.error,
                    "is_unavailable": _is_unavailable(latest.error),
                    "created_at": latest_at.isoformat().replace("+00:00", "Z"),
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
                "trend": trend,
            })

    # Get custom banner
    banner_result = await db.execute(select(Setting).where(Setting.key == "custom_banner"))
    custom_banner = banner_result.scalar_one_or_none()

    return {"plans": plan_data, "custom_banner": custom_banner.value if custom_banner else None, "range": range}
