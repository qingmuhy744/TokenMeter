import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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


@pytest.mark.asyncio
async def test_token_plan_inheritance_fields(db_session: AsyncSession):
    # 创建父计划 (套餐)
    parent = TokenPlan(
        name="Parent Plan",
        api_type="openai",
        api_base="https://api.openai.com/v1",
        api_key="sk-parent",
        model="gpt-4",
    )
    db_session.add(parent)
    await db_session.commit()
    await db_session.refresh(parent)

    # 创建子计划，部分字段继承（为 None）
    child = TokenPlan(
        name="Child Plan",
        parent_id=parent.id,
        multiplier=0.5,
        api_type=None,  # 继承
        api_base=None,  # 继承
        api_key=None,  # 继承
        model=None,  # 继承
    )
    db_session.add(child)
    await db_session.commit()
    await db_session.refresh(child)

    assert child.parent_id == parent.id
    assert child.multiplier == 0.5
    assert child.api_type is None
    assert child.api_base is None

    # 测试关系
    stmt = (
        select(TokenPlan)
        .options(selectinload(TokenPlan.children))
        .where(TokenPlan.id == parent.id)
    )
    result = await db_session.execute(stmt)
    parent_loaded = result.scalar_one()
    assert len(parent_loaded.children) == 1
    assert parent_loaded.children[0].id == child.id

    stmt_child = (
        select(TokenPlan)
        .options(selectinload(TokenPlan.parent))
        .where(TokenPlan.id == child.id)
    )
    result_child = await db_session.execute(stmt_child)
    child_loaded = result_child.scalar_one()
    assert child_loaded.parent.id == parent.id
