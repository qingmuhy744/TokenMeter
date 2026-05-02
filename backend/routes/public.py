from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from backend.database import async_session
from backend.models import TokenPlan, TestResult, Setting
from backend.schemas import (
    PublicTestResultResponse,
    PublicPaginatedResponse,
    MatrixItem,
)

router = APIRouter(prefix="/api/public", tags=["public"])


def _is_unavailable(error: str | None) -> bool:
    """Check if an error indicates the service is unavailable (including 429/overload)."""
    if not error:
        return False
    error_lower = error.lower()
    return any(
        kw in error_lower
        for kw in [
            "429",
            "529",
            "overload",
            "rate limit",
            "too many",
            "unavailable",
            "503",
            "502",
            "timeout",
        ]
    )


def _range_to_timedelta(range_str: str) -> timedelta:
    return {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }.get(range_str, timedelta(hours=24))


def _get_bucket_config(range_str: Literal["24h", "7d", "30d"]) -> tuple[int, int]:
    """Returns (bucket_ms, min_interval_ms) for given range."""
    configs = {
        "24h": (10 * 60 * 1000, 10 * 60 * 1000),  # 10min bucket, 10min min interval
        "7d": (60 * 60 * 1000, 60 * 60 * 1000),  # 1hr bucket, 1hr min interval
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


def _aggregate_trend_data(
    items: list[TestResult], bucket_ms: int, min_interval_ms: int
) -> list[dict]:
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
        max_interval = max(
            (sorted_times[i + 1] - sorted_times[i]).total_seconds() * 1000
            for i in range(len(sorted_times) - 1)
        )
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
        median_tps_gen = (
            sorted(tps_gen_list)[len(tps_gen_list) // 2] if tps_gen_list else None
        )

        result.append(
            {
                "time": bucket_ts.isoformat().replace("+00:00", "Z"),
                "tps_overall": round(median_tps, 1) if median_tps is not None else None,
                "tps_generate": round(median_tps_gen, 1)
                if median_tps_gen is not None
                else None,
                "ttft_ms": round(median_ttft) if median_ttft is not None else None,
            }
        )

    return result


@router.get("/status")
async def public_status(range: str = Query("24h", pattern="^(24h|7d|30d)$")):
    since = datetime.now(timezone.utc) - _range_to_timedelta(range)

    async with async_session() as db:
        # Get only actual models (those that have a parent suite)
        plans_result = await db.execute(
            select(TokenPlan)
            .where(TokenPlan.is_active, TokenPlan.parent_id.is_not(None))
            .order_by(TokenPlan.id)
        )
        plans = plans_result.scalars().all()
        plan_ids = [p.id for p in plans]

        if not plan_ids:
            return {"plans": [], "custom_banner": None, "range": range}

        # Bulk fetch latest results
        latest_results_query = select(TestResult).where(
            TestResult.id.in_(
                select(func.max(TestResult.id))
                .where(TestResult.plan_id.in_(plan_ids))
                .group_by(TestResult.plan_id)
            )
        )
        latest_results_res = await db.execute(latest_results_query)
        latest_map = {r.plan_id: r for r in latest_results_res.scalars().all()}

        # Bulk fetch all results in range for availability and stats
        range_results_res = await db.execute(
            select(TestResult)
            .where(TestResult.plan_id.in_(plan_ids))
            .where(TestResult.created_at >= since)
            .order_by(TestResult.created_at.asc())
        )
        all_results = range_results_res.scalars().all()

        # Group results by plan
        results_by_plan = {pid: [] for pid in plan_ids}
        for r in all_results:
            results_by_plan[r.plan_id].append(r)

        plan_data = []
        bucket_ms, min_interval_ms = _get_bucket_config(range)

        for plan in plans:
            plan_results = results_by_plan[plan.id]

            # Availability
            total_count = len(plan_results)
            if total_count > 0:
                success_count = sum(
                    1
                    for r in plan_results
                    if r.error is None and not _is_unavailable(r.error)
                )
                availability_pct = round(success_count / total_count * 100, 1)
            else:
                availability_pct = None

            # Stats (successful tests only)
            successful = [
                r for r in plan_results if r.error is None and r.tps_overall is not None
            ]
            if successful:
                ttfts = sorted([r.ttft_ms for r in successful if r.ttft_ms is not None])
                tps_list = sorted([r.tps_overall for r in successful])
                tps_gen_list = sorted(
                    [r.tps_generate for r in successful if r.tps_generate is not None]
                )
                avg_ttft = round(sum(ttfts) / len(ttfts)) if ttfts else None
                avg_tps = round(sum(tps_list) / len(tps_list), 1) if tps_list else None
                avg_tps_gen = (
                    round(sum(tps_gen_list) / len(tps_gen_list), 1)
                    if tps_gen_list
                    else None
                )
                p95_ttft = ttfts[int(len(ttfts) * 0.95)] if ttfts else None
                stats = {
                    "avg_ttft_ms": avg_ttft,
                    "avg_tps_overall": avg_tps,
                    "avg_tps_generate": avg_tps_gen,
                    "p95_ttft_ms": round(p95_ttft) if p95_ttft else None,
                    "count": len(successful),
                }
            else:
                stats = {
                    "avg_ttft_ms": None,
                    "avg_tps_overall": None,
                    "avg_tps_generate": None,
                    "p95_ttft_ms": None,
                    "count": 0,
                }

            # Trend data
            trend = _aggregate_trend_data(
                [r for r in plan_results if r.error is None], bucket_ms, min_interval_ms
            )

            latest = latest_map.get(plan.id)
            latest_data = None
            if latest:
                latest_at = latest.created_at
                if latest_at.tzinfo is None:
                    latest_at = latest_at.replace(tzinfo=timezone.utc)
                latest_data = {
                    "ttft_ms": round(latest.ttft_ms) if latest.ttft_ms else None,
                    "tps_overall": round(latest.tps_overall, 1)
                    if latest.tps_overall
                    else None,
                    "tps_generate": round(latest.tps_generate, 1)
                    if latest.tps_generate
                    else None,
                    "tps_content": round(latest.tps_content, 1)
                    if latest.tps_content
                    else None,
                    "ttfb_ms": round(latest.ttfb_ms) if latest.ttfb_ms else None,
                    "ttfr_ms": round(latest.ttfr_ms) if latest.ttfr_ms else None,
                    "think_time_ms": round(latest.think_time_ms)
                    if latest.think_time_ms
                    else None,
                    "thinking_tokens": latest.thinking_tokens,
                    "content_tokens": latest.content_tokens,
                    "content_char_count": latest.content_char_count,
                    "thinking_char_count": latest.thinking_char_count,
                    "ping_ms": round(latest.ping_ms) if latest.ping_ms else None,
                    "error": latest.error,
                    "is_unavailable": _is_unavailable(latest.error),
                    "created_at": latest_at.isoformat().replace("+00:00", "Z"),
                }

            plan_data.append(
                {
                    "id": plan.id,
                    "name": plan.name,
                    "model": plan.model,
                    "api_type": plan.api_type,
                    "is_active": plan.is_active,
                    "latest_result": latest_data,
                    "availability_pct": availability_pct,
                    "stats": stats,
                    "trend": trend,
                }
            )

        # Get custom banner (INSIDE the same session)
        banner_result = await db.execute(
            select(Setting).where(Setting.key == "custom_banner")
        )
        custom_banner = banner_result.scalar_one_or_none()

    return {
        "plans": plan_data,
        "custom_banner": custom_banner.value if custom_banner else None,
        "range": range,
    }


@router.get("/results", response_model=PublicPaginatedResponse)
async def public_results(
    plan_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    async with async_session() as db:
        query = (
            select(TestResult, TokenPlan.name)
            .join(TokenPlan, TestResult.plan_id == TokenPlan.id)
            .where(TestResult.plan_id == plan_id)
            .order_by(TestResult.created_at.desc())
        )
        count_query = select(func.count(TestResult.id)).where(
            TestResult.plan_id == plan_id
        )

        total_result = await db.execute(count_query)
        total = total_result.scalar()

        query = query.offset((page - 1) * size).limit(size)
        result = await db.execute(query)
        rows = result.all()

    items = []
    for test_result, plan_name in rows:
        item = PublicTestResultResponse.model_validate(test_result)
        item.plan_name = plan_name
        items.append(item)

    return PublicPaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


@router.get("/matrix", response_model=list[MatrixItem])
async def public_matrix(
    days: int = Query(7, ge=1),
    tz_offset: int = Query(0),
    mode: str = Query("all"),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    since_24h = now - timedelta(hours=24)

    async with async_session() as db:
        plans_result = await db.execute(
            select(TokenPlan)
            .options(selectinload(TokenPlan.parent))
            .where(TokenPlan.is_active)
        )
        plans = plans_result.scalars().all()
        plan_ids = [p.id for p in plans]

        results_data = await db.execute(
            select(TestResult)
            .where(TestResult.plan_id.in_(plan_ids))
            .where(TestResult.created_at >= since)
            .order_by(TestResult.created_at.desc())
        )
        all_results = results_data.scalars().all()

    plan_results = {p.id: [] for p in plans}
    for r in all_results:
        r.created_at = (
            r.created_at.replace(tzinfo=timezone.utc)
            if r.created_at.tzinfo is None
            else r.created_at
        )
        plan_results[r.plan_id].append(r)

    matrix = []
    for plan in plans:
        results = plan_results[plan.id]
        latest_status = (
            "error"
            if results and results[0].error
            else ("success" if results else "none")
        )
        sparkline = [
            r.ttft_ms
            for r in sorted(
                [r for r in results if r.created_at >= since_24h],
                key=lambda x: x.created_at,
            )
        ]

        success_results = [r for r in results if not r.error]
        day_results = [
            r
            for r in success_results
            if 8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20
        ]
        night_results = [
            r
            for r in success_results
            if not (8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20)
        ]

        stats_results = success_results
        if mode == "day":
            stats_results = day_results
        elif mode == "night":
            stats_results = night_results

        avg_ttft = avg_tps_overall = avg_tps_generate = day_avg_ttft = (
            night_avg_ttft
        ) = degradation = success_rate = None

        if results:
            mode_total = results
            if mode == "day":
                mode_total = [
                    r
                    for r in results
                    if 8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20
                ]
            elif mode == "night":
                mode_total = [
                    r
                    for r in results
                    if not (
                        8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20
                    )
                ]
            if mode_total:
                success_rate = len(stats_results) / len(mode_total)

        if stats_results:
            ttfts = [r.ttft_ms for r in stats_results if r.ttft_ms]
            tps_o = [r.tps_overall for r in stats_results if r.tps_overall]
            tps_g = [r.tps_generate for r in stats_results if r.tps_generate]
            if ttfts:
                avg_ttft = sum(ttfts) / len(ttfts)
            if tps_o:
                avg_tps_overall = sum(tps_o) / len(tps_o)
            if tps_g:
                avg_tps_generate = sum(tps_g) / len(tps_g)

        d_ttfts = [r.ttft_ms for r in day_results if r.ttft_ms]
        n_ttfts = [r.ttft_ms for r in night_results if r.ttft_ms]
        if d_ttfts:
            day_avg_ttft = sum(d_ttfts) / len(d_ttfts)
        if n_ttfts:
            night_avg_ttft = sum(n_ttfts) / len(n_ttfts)
        if day_avg_ttft and night_avg_ttft:
            degradation = (day_avg_ttft - night_avg_ttft) / night_avg_ttft

        full_name = f"{plan.parent.name} > {plan.name}" if plan.parent else plan.name
        matrix.append(
            MatrixItem(
                plan_id=plan.id,
                full_name=full_name,
                latest_status=latest_status,
                sparkline=sparkline,
                avg_ttft=avg_ttft,
                avg_tps_overall=avg_tps_overall,
                avg_tps_generate=avg_tps_generate,
                day_avg_ttft=day_avg_ttft,
                night_avg_ttft=night_avg_ttft,
                degradation=degradation,
                success_rate=success_rate,
            )
        )
    return matrix
