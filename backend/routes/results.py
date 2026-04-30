from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, Query
from sqlalchemy import select, func
from backend.database import async_session
from backend.models import TestResult, TokenPlan
from backend.schemas import TestResultResponse, PaginatedResponse, StatsResponse
from backend.auth import get_current_user

router = APIRouter(prefix="/api/results", tags=["results"])


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
