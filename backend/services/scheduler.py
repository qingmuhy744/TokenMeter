import json
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models import TokenPlan, TestResult
from backend.services.speed_test import SpeedTester
from backend.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def run_speed_test(plan_id: int):
    """Execute a speed test for a given plan and save results."""
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan or not plan.is_active:
            return

    tester = SpeedTester(timeout=settings.TIMEOUT_SECONDS)
    prompt = plan.prompt or settings.DEFAULT_PROMPT

    logger.info(
        "[Scheduler] Running test: plan=%d name=%s model=%s",
        plan_id,
        plan.name,
        plan.model,
    )

    results = []
    for i in range(plan.test_count):
        if plan.api_type == "openai":
            r = await tester.test_openai(
                plan.api_base, plan.api_key, plan.model, prompt, plan.max_tokens
            )
        else:
            r = await tester.test_anthropic(
                plan.api_base, plan.api_key, plan.model, prompt, plan.max_tokens
            )
        logger.info(
            "  Run %d/%d: tokens=%d ttft=%s tps=%s error=%s",
            i + 1,
            plan.test_count,
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


async def sync_scheduled_jobs(db: AsyncSession | None = None):
    """Sync APScheduler jobs with active plans in database."""
    if db is None:
        async with async_session() as db:
            result = await db.execute(select(TokenPlan).where(TokenPlan.is_active))
            plans = result.scalars().all()
    else:
        result = await db.execute(select(TokenPlan).where(TokenPlan.is_active))
        plans = result.scalars().all()

    existing_jobs = {job.id for job in scheduler.get_jobs()}

    for plan in plans:
        job_id = f"plan_{plan.id}"
        if job_id in existing_jobs:
            scheduler.reschedule_job(
                job_id, trigger=IntervalTrigger(minutes=plan.interval_minutes)
            )
        else:
            scheduler.add_job(
                run_speed_test,
                trigger=IntervalTrigger(minutes=plan.interval_minutes),
                id=job_id,
                args=[plan.id],
                replace_existing=True,
            )

    active_ids = {f"plan_{p.id}" for p in plans}
    for job in scheduler.get_jobs():
        if job.id.startswith("plan_") and job.id not in active_ids:
            scheduler.remove_job(job.id)


def start_scheduler():
    scheduler.start()


def shutdown_scheduler():
    scheduler.shutdown(wait=False)
