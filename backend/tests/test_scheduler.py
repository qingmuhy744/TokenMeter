import pytest
from unittest.mock import patch, AsyncMock

from backend.models import TokenPlan
from backend.services.scheduler import (
    sync_scheduled_jobs,
    run_suite_test,
    scheduler,
    suite_ticks,
)


@pytest.fixture(autouse=True)
def clear_jobs():
    """每个测试前清理任务队列。"""
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)
    yield
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)


@pytest.mark.asyncio
async def test_sync_scheduled_jobs_filters_suites(db_session):
    """验证 sync_scheduled_jobs 只为父计划（套餐）注册任务。"""
    # 1. 创建一个套餐和两个子计划
    suite = TokenPlan(name="Test Suite", interval_minutes=5, is_active=True)
    db_session.add(suite)
    await db_session.flush()

    child1 = TokenPlan(name="Child 1", parent_id=suite.id, is_active=True)
    child2 = TokenPlan(name="Child 2", parent_id=suite.id, is_active=True)
    db_session.add_all([child1, child2])

    # 2. 创建一个独立的活跃计划（非套餐子项，但也算作套餐，因为它没有 parent_id）
    standalone = TokenPlan(name="Standalone", interval_minutes=10, is_active=True)
    db_session.add(standalone)

    await db_session.commit()

    # 3. 同步
    await sync_scheduled_jobs(db_session)

    # 4. 验证：应该只有 suite 和 standalone 两个任务
    jobs = scheduler.get_jobs()
    job_ids = {job.id for job in jobs}
    assert len(jobs) == 2
    assert f"suite_{suite.id}" in job_ids
    assert f"suite_{standalone.id}" in job_ids
    assert f"plan_{child1.id}" not in job_ids
    assert f"plan_{child2.id}" not in job_ids


@pytest.mark.asyncio
async def test_run_suite_test_logic(db_session):
    """验证 run_suite_test 的执行逻辑：倍率判定、顺序执行和间隔。"""
    # 1. 创建测试数据
    suite = TokenPlan(name="Logic Suite", interval_minutes=5, is_active=True)
    db_session.add(suite)
    await db_session.flush()

    # child1: multiplier=1.0 (每次都跑)
    child1 = TokenPlan(
        name="Always Run", parent_id=suite.id, multiplier=1.0, is_active=True
    )
    # child2: multiplier=0.5 (每两次跑一次)
    child2 = TokenPlan(
        name="Half Run", parent_id=suite.id, multiplier=0.5, is_active=True
    )
    db_session.add_all([child1, child2])
    await db_session.commit()

    # 重置全局计数器
    suite_ticks[suite.id] = 0

    with patch(
        "backend.services.scheduler.run_plan_test", new_callable=AsyncMock
    ) as mock_run:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            # --- 第 1 次执行 (tick=0) ---
            await run_suite_test(suite.id, db=db_session)
            # 0 % 1 == 0, 0 % 2 == 0 -> 两个都跑
            assert mock_run.call_count == 2
            # 验证执行顺序和 ID
            assert mock_run.call_args_list[0][0][0] == child1.id
            assert mock_run.call_args_list[1][0][0] == child2.id
            # 验证休眠被调用（每个子模型跑完后都会休眠）
            assert mock_sleep.call_count == 2

            mock_run.reset_mock()
            mock_sleep.reset_mock()

            # --- 第 2 次执行 (tick=1) ---
            await run_suite_test(suite.id, db=db_session)
            # 1 % 1 == 0 (run), 1 % 2 != 0 (skip) -> 只跑 child1
            assert mock_run.call_count == 1
            assert mock_run.call_args_list[0][0][0] == child1.id
            assert mock_sleep.call_count == 1

            mock_run.reset_mock()
            mock_sleep.reset_mock()

            # --- 第 3 次执行 (tick=2) ---
            await run_suite_test(suite.id, db=db_session)
            # 2 % 1 == 0, 2 % 2 == 0 -> 两个都跑
            assert mock_run.call_count == 2
            assert mock_run.call_args_list[0][0][0] == child1.id
            assert mock_run.call_args_list[1][0][0] == child2.id


@pytest.mark.asyncio
async def test_sync_scheduled_jobs_cleanup(db_session):
    """验证 sync_scheduled_jobs 会清理旧的任务。"""
    # 1. 模拟一个旧的计划任务
    scheduler.add_job(lambda: None, trigger="interval", minutes=1, id="plan_999")
    scheduler.add_job(lambda: None, trigger="interval", minutes=1, id="suite_888")

    assert len(scheduler.get_jobs()) == 2

    # 2. 执行同步（此时数据库中没有任何活跃计划）
    await sync_scheduled_jobs(db_session)

    # 3. 验证所有任务都被清理了
    assert len(scheduler.get_jobs()) == 0
