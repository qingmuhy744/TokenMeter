from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.database import async_session
from backend.models import TokenPlan, TestResult
from backend.schemas import PlanCreate, PlanUpdate, PlanResponse, PlanWithLatestResult
from backend.auth import get_current_user
from backend.services.speed_test import SpeedTester
from backend.services.scheduler import sync_scheduled_jobs
from backend.config import settings

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("")
async def list_plans(request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(
            select(TokenPlan).options(selectinload(TokenPlan.results)).order_by(TokenPlan.id.desc())
        )
        plans = result.scalars().all()

    response = []
    for plan in plans:
        latest = max(plan.results, key=lambda r: r.created_at, default=None)
        response.append(PlanWithLatestResult(
            **PlanResponse.model_validate(plan).model_dump(),
            latest_result=latest,
        ))
    return response


@router.post("")
async def create_plan(body: PlanCreate, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        plan = TokenPlan(**body.model_dump())
        db.add(plan)
        await db.commit()
        await db.refresh(plan)

    await sync_scheduled_jobs()
    return PlanResponse.model_validate(plan)


@router.get("/{plan_id}")
async def get_plan(plan_id: int, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return PlanResponse.model_validate(plan)


@router.put("/{plan_id}")
async def update_plan(plan_id: int, body: PlanUpdate, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(plan, field, value)
        await db.commit()
        await db.refresh(plan)

    await sync_scheduled_jobs()
    return PlanResponse.model_validate(plan)


@router.delete("/{plan_id}")
async def delete_plan(plan_id: int, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        await db.delete(plan)
        await db.commit()

    await sync_scheduled_jobs()
    return {"message": "Deleted"}


@router.post("/{plan_id}/test")
async def trigger_test(plan_id: int, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

    tester = SpeedTester(timeout=settings.TIMEOUT_SECONDS)
    prompt = plan.prompt or settings.DEFAULT_PROMPT

    results = []
    for _ in range(plan.test_count):
        if plan.api_type == "openai":
            r = await tester.test_openai(plan.api_base, plan.api_key, plan.model, prompt, plan.max_tokens)
        else:
            r = await tester.test_anthropic(plan.api_base, plan.api_key, plan.model, prompt, plan.max_tokens)
        results.append(r)

    valid = [r for r in results if r.error is None]
    if valid:
        valid.sort(key=lambda r: r.tps_overall or 0)
        median = valid[len(valid) // 2]
    else:
        median = results[0]

    async with async_session() as db:
        test_result = TestResult(
            plan_id=plan_id,
            ttft_ms=median.ttft_ms,
            tps_overall=median.tps_overall,
            tps_generate=median.tps_generate,
            total_tokens=median.total_tokens,
            total_time_ms=median.total_time_ms,
            error=median.error,
        )
        db.add(test_result)
        await db.commit()
        await db.refresh(test_result)

    return {"message": "Test completed", "results_count": len(results)}
