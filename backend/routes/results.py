from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from backend.database import async_session
from backend.models import TestResult, TokenPlan
from backend.schemas import (
    TestResultResponse,
    PaginatedResponse,
    StatsResponse,
    MatrixItem,
    _ensure_utc,
)
from backend.auth import get_current_user

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/matrix", response_model=list[MatrixItem])
async def get_results_matrix(
    request: Request,
    days: int = Query(7, ge=1),
    tz_offset: int = Query(0),  # minutes, e.g. 480 for UTC+8
    mode: str = Query("all"),  # all, day, night
):
    await get_current_user(request)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    since_24h = now - timedelta(hours=24)

    async with async_session() as db:
        # Get all active plans and their parents
        plans_result = await db.execute(
            select(TokenPlan)
            .options(selectinload(TokenPlan.parent))
            .where(TokenPlan.is_active)
        )
        plans = plans_result.scalars().all()
        plan_ids = [p.id for p in plans]

        # Get all results for these plans in the given time window
        results_query = (
            select(TestResult)
            .where(TestResult.plan_id.in_(plan_ids))
            .where(TestResult.created_at >= since)
            .order_by(TestResult.created_at.desc())
        )
        results_data = await db.execute(results_query)
        all_results = results_data.scalars().all()

    # Group results by plan_id
    plan_results = {p.id: [] for p in plans}
    for r in all_results:
        r.created_at = _ensure_utc(r.created_at)
        plan_results[r.plan_id].append(r)

    matrix = []
    for plan in plans:
        results = plan_results[plan.id]

        # Latest status (always based on latest result regardless of mode)
        latest_status = "none"
        if results:
            latest_status = "error" if results[0].error else "success"

        # Sparkline (last 24h, always based on all results for trend)
        sparkline_results = [r for r in results if r.created_at >= since_24h]
        sparkline_results.sort(key=lambda x: x.created_at)
        sparkline = [r.tps_overall for r in sparkline_results]

        # Statistics and Day/Night splitting
        success_results = [r for r in results if not r.error]

        day_results = []
        night_results = []
        for r in success_results:
            local_dt = r.created_at + timedelta(minutes=tz_offset)
            if 8 <= local_dt.hour < 20:
                day_results.append(r)
            else:
                night_results.append(r)

        # Decide which results to use for main stats based on mode
        stats_results = success_results
        if mode == "day":
            stats_results = day_results
        elif mode == "night":
            stats_results = night_results

        avg_ttft = None
        avg_tps_overall = None
        avg_tps_generate = None
        day_avg_ttft = None
        night_avg_ttft = None
        degradation = None
        success_rate = None

        # Success rate is also mode-dependent
        mode_total_results = results
        if mode == "day":
            mode_total_results = [
                r
                for r in results
                if 8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20
            ]
        elif mode == "night":
            mode_total_results = [
                r
                for r in results
                if not (8 <= (r.created_at + timedelta(minutes=tz_offset)).hour < 20)
            ]

        if mode_total_results:
            success_rate = len(stats_results) / len(mode_total_results)

        if stats_results:
            ttfts = [r.ttft_ms for r in stats_results if r.ttft_ms is not None]
            tps_overalls = [
                r.tps_overall for r in stats_results if r.tps_overall is not None
            ]
            tps_generates = [
                r.tps_generate for r in stats_results if r.tps_generate is not None
            ]

            if ttfts:
                avg_ttft = sum(ttfts) / len(ttfts)
            if tps_overalls:
                avg_tps_overall = sum(tps_overalls) / len(tps_overalls)
            if tps_generates:
                avg_tps_generate = sum(tps_generates) / len(tps_generates)

        # Always calculate comparison values for degradation regardless of mode
        d_ttfts = [r.ttft_ms for r in day_results if r.ttft_ms is not None]
        n_ttfts = [r.ttft_ms for r in night_results if r.ttft_ms is not None]
        if d_ttfts:
            day_avg_ttft = sum(d_ttfts) / len(d_ttfts)
        if n_ttfts:
            night_avg_ttft = sum(n_ttfts) / len(n_ttfts)

        if (
            day_avg_ttft is not None
            and night_avg_ttft is not None
            and night_avg_ttft > 0
        ):
            degradation = (day_avg_ttft - night_avg_ttft) / night_avg_ttft

        full_name = plan.name
        if plan.parent:
            full_name = f"{plan.parent.name} > {plan.name}"

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


@router.get("")
async def list_results(
    request: Request,
    plan_id: int | None = None,
    start: str | None = None,
    end: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    await get_current_user(request)
    async with async_session() as db:
        query = (
            select(TestResult, TokenPlan.name)
            .join(TokenPlan, TestResult.plan_id == TokenPlan.id)
            .order_by(TestResult.created_at.desc())
        )
        count_query = select(func.count(TestResult.id))

        if plan_id:
            query = query.where(TestResult.plan_id == plan_id)
            count_query = count_query.where(TestResult.plan_id == plan_id)

        if start:
            start_dt = datetime.fromisoformat(start)
            query = query.where(TestResult.created_at >= start_dt)
            count_query = count_query.where(TestResult.created_at >= start_dt)
        if end:
            end_dt = datetime.fromisoformat(end)
            query = query.where(TestResult.created_at <= end_dt)
            count_query = count_query.where(TestResult.created_at <= end_dt)

        total_result = await db.execute(count_query)
        total = total_result.scalar()

        query = query.offset((page - 1) * size).limit(size)
        result = await db.execute(query)
        rows = result.all()

    items = []
    for test_result, plan_name in rows:
        item = TestResultResponse.model_validate(test_result)
        item.plan_name = plan_name
        items.append(item)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


@router.get("/stats")
async def get_stats(request: Request, plan_id: int, days: int = 7):
    await get_current_user(request)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    async with async_session() as db:
        result = await db.execute(
            select(TestResult)
            .where(TestResult.plan_id == plan_id)
            .where(TestResult.error.is_(None))
            .where(TestResult.created_at >= since)
            .order_by(TestResult.created_at.desc())
        )
        items = result.scalars().all()

    if not items:
        return StatsResponse(
            plan_id=plan_id,
            count=0,
            avg_ttft_ms=None,
            avg_tps_overall=None,
            avg_tps_generate=None,
            median_ttft_ms=None,
            median_tps_overall=None,
            p95_ttft_ms=None,
        )

    ttfts = sorted([r.ttft_ms for r in items if r.ttft_ms is not None])
    tps_list = sorted([r.tps_overall for r in items if r.tps_overall is not None])
    tps_gen = sorted([r.tps_generate for r in items if r.tps_generate is not None])

    def avg(lst):
        return sum(lst) / len(lst) if lst else None

    def median(lst):
        if not lst:
            return None
        return lst[len(lst) // 2]

    def p95(lst):
        if not lst:
            return None
        idx = int(len(lst) * 0.95)
        return lst[min(idx, len(lst) - 1)]

    return StatsResponse(
        plan_id=plan_id,
        count=len(items),
        avg_ttft_ms=avg(ttfts),
        avg_tps_overall=avg(tps_list),
        avg_tps_generate=avg(tps_gen),
        median_ttft_ms=median(ttfts),
        median_tps_overall=median(tps_list),
        p95_ttft_ms=p95(ttfts),
    )


@router.delete("/{result_id}")
async def delete_result(request: Request, result_id: int):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TestResult).where(TestResult.id == result_id))
        item = result.scalar_one_or_none()
        if not item:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Result not found")
        await db.delete(item)
        await db.commit()
    return {"ok": True}
