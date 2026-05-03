import json
import logging
import asyncio
import random

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models import TokenPlan, TestResult
from backend.services.speed_test import SpeedTester
from backend.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# 全局计数器，用于倍率判定
suite_ticks = {}


async def run_plan_test(plan_id: int, db: AsyncSession | None = None):
    """Execute a speed test for a given plan and save results."""
    if db is None:
        async with async_session() as db:
            result = await db.execute(
                select(TokenPlan)
                .options(selectinload(TokenPlan.parent))
                .where(TokenPlan.id == plan_id)
            )
            plan = result.scalar_one_or_none()
            if not plan or not plan.is_active:
                return
            await _execute_and_save_test(plan, db)
    else:
        result = await db.execute(
            select(TokenPlan)
            .options(selectinload(TokenPlan.parent))
            .where(TokenPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan or not plan.is_active:
            return
        await _execute_and_save_test(plan, db)


async def _execute_and_save_test(plan: TokenPlan, db: AsyncSession):
    """Core logic to run a test and save result, separated for session management."""
    tester = SpeedTester(timeout=settings.TIMEOUT_SECONDS)
    prompt = plan.effective_prompt or settings.DEFAULT_PROMPT

    logger.info(
        "[Scheduler] Running test: plan=%d name=%s model=%s",
        plan.id,
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
            "  Run %d/%d: tokens=%d ttft=%s tps=%s error=%s",
            i + 1,
            test_count,
            r.total_tokens,
            f"{r.ttft_ms:.0f}" if r.ttft_ms else "N/A",
            f"{r.tps_overall:.1f}" if r.tps_overall else "N/A",
            r.error or "none",
        )
        results.append(r)

    valid = [r for r in results if r.error is None]
    if valid:
        valid.sort(key=lambda r: r.tps_overall or 0)
        median = valid[len(valid) // 2]
    elif results:
        median = results[0]
    else:
        return

    test_result = TestResult(
        plan_id=plan.id,
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
        debug_chunks=json.dumps(median.debug_chunks) if median.debug_chunks else None,
    )
    db.add(test_result)
    await db.commit()


async def run_suite_test(suite_id: int, db: AsyncSession | None = None):
    """Execute speed tests for all children of a suite, respecting multipliers and delays."""
    if db is None:
        async with async_session() as db:
            await _run_suite_test_internal(suite_id, db)
    else:
        await _run_suite_test_internal(suite_id, db)


async def _run_suite_test_internal(suite_id: int, db: AsyncSession):
    """Internal suite test logic."""
    result = await db.execute(
        select(TokenPlan)
        .options(selectinload(TokenPlan.children))
        .where(TokenPlan.id == suite_id)
    )
    suite = result.scalar_one_or_none()
    if not suite or not suite.is_active:
        return

    # 维护 tick 计数器
    tick = suite_ticks.get(suite_id, 0)
    suite_ticks[suite_id] = tick + 1

    logger.info(
        "[Scheduler] Suite test wake up: suite=%d name=%s tick=%d",
        suite_id,
        suite.name,
        tick,
    )

    for child in suite.children:
        if not child.is_active:
            continue

        # 倍率判定
        multiplier = child.multiplier or 1.0
        if multiplier < 1.0:
            interval = int(1.0 / multiplier)
            if tick % interval != 0:
                logger.info(
                    "  Skipping child %d (%s) due to multiplier %.2f (tick %d mod %d != 0)",
                    child.id,
                    child.name,
                    multiplier,
                    tick,
                    interval,
                )
                continue

        # 顺序执行单次测试
        try:
            # Re-fetch child or use directly? Better re-fetch to ensure fresh state if needed,
            # but here we can just pass the child ID and current session.
            await run_plan_test(child.id, db=db)
        except Exception as e:
            logger.error("  Error running test for child %d: %s", child.id, e)

        # 每个子模型测试完成后，休眠规避并发限制
        wait_time = random.uniform(2, 10)  # nosec

        logger.info("  Waiting %.1fs before next child...", wait_time)
        await asyncio.sleep(wait_time)


async def sync_scheduled_jobs(db: AsyncSession | None = None):
    """Sync APScheduler jobs with active suites in database."""
    if db is None:
        async with async_session() as db:
            result = await db.execute(
                select(TokenPlan).where(
                    TokenPlan.parent_id.is_(None), TokenPlan.is_active
                )
            )
            suites = result.scalars().all()
    else:
        result = await db.execute(
            select(TokenPlan).where(TokenPlan.parent_id.is_(None), TokenPlan.is_active)
        )
        suites = result.scalars().all()

    existing_jobs = {job.id for job in scheduler.get_jobs()}

    for suite in suites:
        job_id = f"suite_{suite.id}"
        if job_id in existing_jobs:
            scheduler.reschedule_job(
                job_id, trigger=IntervalTrigger(minutes=suite.interval_minutes)
            )
        else:
            scheduler.add_job(
                run_suite_test,
                trigger=IntervalTrigger(minutes=suite.interval_minutes),
                id=job_id,
                args=[suite.id],
                replace_existing=True,
            )

    active_ids = {f"suite_{s.id}" for s in suites}
    for job in scheduler.get_jobs():
        if job.id.startswith("suite_") and job.id not in active_ids:
            scheduler.remove_job(job.id)
        # 清理旧版本的 plan_ 前缀任务
        elif job.id.startswith("plan_"):
            scheduler.remove_job(job.id)


def start_scheduler():
    scheduler.start()


def shutdown_scheduler():
    scheduler.shutdown(wait=False)
