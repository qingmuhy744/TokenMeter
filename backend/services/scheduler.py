from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from backend.database import async_session
from backend.models import TokenPlan, TestResult
from backend.services.speed_test import SpeedTester
from backend.config import settings

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


async def sync_scheduled_jobs():
    """Sync APScheduler jobs with active plans in database."""
    async with async_session() as db:
        result = await db.execute(select(TokenPlan).where(TokenPlan.is_active == True))
        plans = result.scalars().all()

    existing_jobs = {job.id for job in scheduler.get_jobs()}

    for plan in plans:
        job_id = f"plan_{plan.id}"
        if job_id in existing_jobs:
            scheduler.reschedule_job(job_id, trigger=IntervalTrigger(minutes=plan.interval_minutes))
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
