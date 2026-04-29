"""
Seed fake data for development/testing.
Run with: uv run python -m backend.seed_data
"""
import asyncio
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from backend.database import async_session
from backend.models import TokenPlan, TestResult


async def seed_data():
    async with async_session() as db:
        # Check if we already have data
        result = await db.execute(text("SELECT COUNT(*) FROM test_results"))
        count = result.scalar()
        if count > 0:
            print(f"Database already has {count} test results, skipping seed.")
            return

        # Create two plans
        plan1 = TokenPlan(
            name="MiniMax-M2.7",
            api_type="anthropic",
            api_base="https://api.minimaxi.com",
            api_key="fake-key-1",
            model="MiniMax-M2.7",
            is_active=True,
        )
        plan2 = TokenPlan(
            name="MiMo-V2.5",
            api_type="anthropic",
            api_base="https://api.xiaomimimo.com",
            api_key="fake-key-2",
            model="mimo-v2.5-pro",
            is_active=True,
        )
        db.add_all([plan1, plan2])
        await db.flush()

        now = datetime.now(timezone.utc)

        # Plan 1: tests every 10 minutes for last 2 hours
        for i in range(12):
            offset = i * 10
            tr = TestResult(
                plan_id=plan1.id,
                ttft_ms=100 + i * 5,
                tps_overall=50 + i * 0.5,
                tps_generate=60 + i * 0.8,  # higher than overall due to think time
                total_tokens=100 + i * 10,
                total_time_ms=2000,
                created_at=now - timedelta(minutes=offset),
            )
            db.add(tr)

        # Plan 2: tests every 15 minutes for last 2 hours
        for i in range(8):
            offset = i * 15
            tr = TestResult(
                plan_id=plan2.id,
                ttft_ms=150 + i * 8,
                tps_overall=40 + i * 0.8,
                tps_generate=48 + i * 1.0,  # higher than overall due to think time
                total_tokens=90 + i * 8,
                total_time_ms=2250,
                created_at=now - timedelta(minutes=offset + 5),  # offset by 5min so they're staggered
            )
            db.add(tr)

        await db.commit()
        print(f"Seeded 12 + 8 = 20 fake test results for plans '{plan1.name}' and '{plan2.name}'")


if __name__ == "__main__":
    asyncio.run(seed_data())
