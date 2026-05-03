import pytest
from sqlalchemy import select, text
from backend.models import TokenPlan, TestResult
from backend.migrations.manager import convert_to_suites
from backend.database import async_sessionmaker, AsyncSession


@pytest.mark.asyncio
async def test_convert_to_suites_migration(db_engine):
    """Test that convert_to_suites correctly migrates plans and results."""
    async_session = async_sessionmaker(db_engine, class_=AsyncSession)

    # 1. Setup: Create an independent plan and some results
    async with async_session() as session:
        # Clear any existing data
        await session.execute(text("DELETE FROM test_results"))
        await session.execute(text("DELETE FROM token_plans"))

        plan = TokenPlan(
            name="Test Plan",
            api_type="openai",
            api_base="https://api.openai.com",
            api_key="sk-test",
            model="gpt-4",
            prompt="Hello",
            max_tokens=100,
            test_count=5,
            interval_minutes=30,
            is_active=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        plan_id = plan.id

        # Add a test result for this plan
        result = TestResult(plan_id=plan_id, ttft_ms=100.0, tps_overall=50.0)
        session.add(result)
        await session.commit()
        await session.refresh(result)
        result_id = result.id

    # 2. Run the specific migration function
    async with async_session() as session:
        await convert_to_suites(session)
        await session.commit()

    # 3. Verify results
    async with async_session() as session:
        # Parent plan should now have model=None
        res = await session.execute(select(TokenPlan).where(TokenPlan.id == plan_id))
        parent = res.scalar_one()
        assert parent.model is None
        assert parent.api_type == "openai"  # Should keep its config

        # Should have a child plan
        res = await session.execute(
            select(TokenPlan).where(TokenPlan.parent_id == plan_id)
        )
        child = res.scalar_one()
        assert child.name == "Test Plan"
        assert child.model == "gpt-4"
        assert child.api_type is None  # Should be None for inheritance
        assert child.api_base is None
        assert child.multiplier == 1.0
        assert child.is_active is True

        # TestResult should now point to child.id
        res = await session.execute(
            select(TestResult).where(TestResult.id == result_id)
        )
        migrated_result = res.scalar_one()
        assert migrated_result.plan_id == child.id
        assert migrated_result.plan_id != plan_id
