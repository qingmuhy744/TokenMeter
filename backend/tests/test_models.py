import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import TokenPlan, TestResult


@pytest.mark.asyncio
async def test_create_token_plan(db_session: AsyncSession):
    plan = TokenPlan(
        name="Test Plan",
        api_type="openai",
        api_base="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o",
        max_tokens=256,
        test_count=3,
        interval_minutes=60,
        is_active=True,
    )
    db_session.add(plan)
    await db_session.commit()

    result = await db_session.execute(
        select(TokenPlan).where(TokenPlan.name == "Test Plan")
    )
    saved = result.scalar_one()
    assert saved.name == "Test Plan"
    assert saved.api_type == "openai"
    assert saved.is_active is True


@pytest.mark.asyncio
async def test_create_test_result(db_session: AsyncSession):
    plan = TokenPlan(
        name="Test",
        api_type="openai",
        api_base="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o",
    )
    db_session.add(plan)
    await db_session.flush()

    result = TestResult(
        plan_id=plan.id,
        ttft_ms=150.5,
        tps_overall=45.2,
        tps_generate=52.1,
        total_tokens=128,
        total_time_ms=2830.0,
    )
    db_session.add(result)
    await db_session.commit()

    saved = await db_session.execute(
        select(TestResult).where(TestResult.plan_id == plan.id)
    )
    assert saved.scalar_one().ttft_ms == 150.5
