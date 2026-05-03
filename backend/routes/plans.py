import json
import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import SQLAlchemyError
from fastapi import APIRouter, HTTPException, Request, Response

from backend.database import async_session
from backend.models import TokenPlan, TestResult
from backend.schemas import PlanCreate, PlanUpdate, PlanResponse
from backend.services.speed_test import SpeedTester
from backend.services.scheduler import sync_scheduled_jobs
from backend.config import settings
from backend.auth import get_current_user

router = APIRouter(prefix="/api/plans", tags=["plans"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[PlanResponse])
async def list_plans(request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(
            select(TokenPlan)
            .options(
                selectinload(TokenPlan.parent).selectinload(TokenPlan.parent),
                selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent),
            )
            .order_by(TokenPlan.id.asc())
        )
        plans = result.scalars().all()
        return [PlanResponse.model_validate(p) for p in plans]


@router.get("/export")
async def export_plans(request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).order_by(TokenPlan.id.asc()))
        plans = result.scalars().all()

    export_data = []
    for plan in plans:
        # Include api_key for transferability/backup
        export_data.append(
            {
                "name": plan.name,
                "api_type": plan.api_type,
                "api_base": plan.api_base,
                "api_key": plan.api_key,
                "model": plan.model,
                "prompt": plan.prompt,
                "max_tokens": plan.max_tokens,
                "test_count": plan.test_count,
                "interval_minutes": plan.interval_minutes,
                "is_active": plan.is_active,
                "parent_id": plan.parent_id,
                "multiplier": plan.multiplier,
            }
        )

    return Response(
        content=json.dumps(export_data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=tokenmeter-plans.json"},
    )


@router.post("/import")
async def import_plans(body: list[PlanCreate], request: Request):
    await get_current_user(request)
    imported_count = 0
    async with async_session() as db:
        # Fetch all existing names to prevent N+1 queries
        result = await db.execute(select(TokenPlan.name))
        existing_names = set(result.scalars().all())

        for plan_data in body:
            name = plan_data.name
            # Collision handling: append " (Imported)" until unique
            while name in existing_names:
                name = f"{name} (Imported)"

            # Track names within the batch
            existing_names.add(name)

            plan = TokenPlan(**plan_data.model_dump(exclude={"name"}), name=name)
            db.add(plan)
            imported_count += 1

        try:
            await db.commit()
            # Sync jobs using the same session to avoid connection competition
            await sync_scheduled_jobs(db)
        except SQLAlchemyError as e:
            logger.error("Failed to commit imported plans: %s", str(e))
            raise HTTPException(status_code=400, detail="Database error during import")

    return {"message": f"Imported {imported_count} plans", "count": imported_count}


@router.post("", response_model=PlanResponse)
async def create_plan(body: PlanCreate, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        plan = TokenPlan(**body.model_dump())
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
        if plan.parent_id is not None:
            stmt = (
                select(TokenPlan)
                .options(
                    selectinload(TokenPlan.parent)
                    .selectinload(TokenPlan.parent)
                    .selectinload(TokenPlan.parent)
                )
                .where(TokenPlan.id == plan.id)
            )
            result = await db.execute(stmt)
            plan = result.scalar_one()
        await sync_scheduled_jobs(db)
        return PlanResponse.model_validate(plan)


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: int, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(
            select(TokenPlan)
            .options(
                selectinload(TokenPlan.parent).selectinload(TokenPlan.parent),
                selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent),
            )
            .where(TokenPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        return PlanResponse.model_validate(plan)


@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(plan_id: int, body: PlanUpdate, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(
            select(TokenPlan)
            .options(
                selectinload(TokenPlan.parent).selectinload(TokenPlan.parent),
                selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent)
                .selectinload(TokenPlan.parent),
            )
            .where(TokenPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(plan, field, value)
        await db.commit()
        await db.refresh(plan)
        await sync_scheduled_jobs(db)
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
        await sync_scheduled_jobs(db)

    return {"message": "Deleted"}


@router.post("/{plan_id}/test")
async def trigger_test(plan_id: int, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(
            select(TokenPlan)
            .options(selectinload(TokenPlan.parent))
            .where(TokenPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # If it's a Provider (Suite), run all children sequentially
        if plan.parent_id is None:
            from backend.services.scheduler import run_suite_test

            logger.info(
                "Manual suite test triggered: provider=%d name=%s", plan_id, plan.name
            )
            # Run in background to avoid timeout
            asyncio.create_task(run_suite_test(plan_id))
            return {"message": "Suite test started in background"}

    # Single plan test logic remains the same
    tester = SpeedTester(timeout=settings.TIMEOUT_SECONDS)
    prompt = plan.effective_prompt or settings.DEFAULT_PROMPT

    logger.info(
        "Manual test triggered: plan=%d name=%s model=%s (effective)",
        plan_id,
        plan.name,
        plan.effective_model,
    )

    results = []
    test_count = plan.effective_test_count
    for i in range(test_count):
        if plan.effective_api_type == "openai":
            r = await tester.test_openai(
                plan.effective_api_base,
                plan.effective_api_key,
                plan.effective_model,
                prompt,
                plan.effective_max_tokens,
            )
        else:
            r = await tester.test_anthropic(
                plan.effective_api_base,
                plan.effective_api_key,
                plan.effective_model,
                prompt,
                plan.effective_max_tokens,
            )
        logger.info(
            "  Run %d/%d: tokens=%d ttft=%s tps=%s error=%s note=%s",
            i + 1,
            test_count,
            r.total_tokens,
            f"{r.ttft_ms:.0f}" if r.ttft_ms else "N/A",
            f"{r.tps_overall:.1f}" if r.tps_overall else "N/A",
            r.error or "none",
            r.note or "none",
        )
        results.append(r)

    valid = [r for r in results if r.error is None]
    if valid:
        valid.sort(key=lambda r: r.tps_overall or 0)
        median = valid[len(valid) // 2]
    elif results:
        median = results[0]
    else:
        raise HTTPException(status_code=400, detail="No test results generated")

    async with async_session() as db:
        test_result = TestResult(
            plan_id=plan_id,
            ttft_ms=median.ttft_ms,
            tps_overall=median.tps_overall,
            tps_generate=median.tps_generate,
            total_tokens=median.total_tokens,
            total_time_ms=median.total_time_ms,
            input_tokens=median.input_tokens,
            cache_read=median.cache_read,
            char_count=median.char_count,
            token_density=median.token_density,
            ttfb_ms=median.ttfb_ms,
            ttfr_ms=median.ttfr_ms,
            think_time_ms=median.think_time_ms,
            content_tokens=median.content_tokens,
            thinking_tokens=median.thinking_tokens,
            tps_content=median.tps_content,
            content_char_count=median.content_char_count,
            thinking_char_count=median.thinking_char_count,
            ping_ms=median.ping_ms,
            ping_samples=json.dumps(median.ping_samples)
            if median.ping_samples is not None
            else None,
            error=median.error,
            note=median.note,
            debug_chunks=json.dumps(median.debug_chunks)
            if median.debug_chunks
            else None,
        )
        db.add(test_result)
        await db.commit()
        await db.refresh(test_result)

    return {"message": "Test completed", "results_count": len(results)}
