# TokenMeter 安全与模型治理整改实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 分阶段修复 TokenMeter 的安全问题、公开链路断点、计划模型语义错误、调度一致性问题和测速统计代码债，并在每一步结束后完成回归测试。

**架构：** 方案以最小可回归单元推进：先修安全面和公开接口，再修计划模型和调度，再处理数据库与测速口径。每个任务都要求先补测试，再实现，再运行该任务对应的验证命令。

**技术栈：** FastAPI、SQLAlchemy async、Alembic、React 19、TypeScript、pytest

---

## 文件结构

**创建：**

- `backend/tests/test_security_regressions.py`：覆盖 banner、密钥响应、Session 安全参数等安全回归
- `backend/tests/test_public_matrix.py`：覆盖公开矩阵接口与公共详情数据链路
- `backend/tests/test_plan_validation.py`：覆盖父子关系防环、suite/standalone 判定、multiplier 约束
- `backend/alembic/versions/9b9d8c7e6f5a_add_indexes_for_results_and_plans.py`：新增索引与必要约束迁移

**修改：**

- `backend/main.py`：SessionMiddleware 安全参数
- `backend/schemas.py`：计划响应字段、输入校验、SSRF/multiplier 约束
- `backend/models/__init__.py`：计划模型辅助方法与 suite/standalone 判定
- `backend/routes/plans.py`：计划创建更新校验、手动触发语义、导出导入边界
- `backend/routes/public.py`：新增公开矩阵、调整公开返回字段
- `backend/routes/settings.py`：banner 展示边界
- `backend/services/scheduler.py`：调度同步与 suite 判定
- `backend/services/speed_test.py`：清理调试日志、修正易误导字段行为
- `backend/auth.py`：登录限流修复、必要的安全收敛
- `frontend/src/api/client.ts`：前后端契约同步
- `frontend/src/pages/Status.tsx`：移除危险 HTML 渲染、统一公共 API 调用
- `frontend/src/components/HistoryView.tsx`：公共页面不再请求私有 stats
- `frontend/src/components/MatrixTable.tsx`：兼容公共矩阵接口
- `frontend/src/pages/Plans/index.tsx`：计划编辑不再依赖原始密钥回显
- `frontend/src/pages/Plans/PlanDialog.tsx`：计划表单文案与 multiplier 限制
- `frontend/src/pages/Plans/PlanTable.tsx`：计划类型展示与按钮语义
- `backend/tests/test_inheritance_api.py`：更新已失效的密钥暴露断言
- `backend/tests/test_trigger_test.py`：修正错误 suite 预期
- `backend/tests/test_scheduler.py`：更新 suite/standalone 调度逻辑断言

---

### 任务 1：收紧安全面

**文件：**

- 创建：`backend/tests/test_security_regressions.py`
- 修改：`backend/main.py`
- 修改：`backend/schemas.py`
- 修改：`backend/routes/settings.py`
- 修改：`backend/routes/plans.py`
- 修改：`frontend/src/api/client.ts`
- 修改：`frontend/src/pages/Status.tsx`
- 修改：`frontend/src/pages/Plans/index.tsx`
- 修改：`frontend/src/pages/Plans/PlanDialog.tsx`
- 测试：`backend/tests/test_security_regressions.py`

- [ ] **步骤 1：编写失败的安全回归测试**

```python
async def test_plan_response_does_not_expose_raw_api_keys(auth_client):
    response = await auth_client.get("/api/plans")
    assert response.status_code == 200
    first = response.json()[0]
    assert "api_key" not in first
    assert "effective_api_key" not in first

async def test_status_banner_is_plain_text(auth_client):
    await auth_client.put("/api/settings", json={"custom_banner": "<script>alert(1)</script>"})
    response = await auth_client.get("/api/settings")
    assert response.status_code == 200
    assert response.json()["custom_banner"] == "<script>alert(1)</script>"
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_security_regressions.py -v`
预期：FAIL，当前接口仍暴露 key，banner 仍按 HTML 渲染或缺少对应行为

- [ ] **步骤 3：实现最小安全修复**

```python
class PlanResponse(BaseModel):
    has_api_key: bool
    has_effective_api_key: bool
```

```tsx
<div>{data.custom_banner}</div>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_security_regressions.py -v`
预期：PASS

- [ ] **步骤 5：运行该步回归集**

运行：`uv run pytest backend/tests/test_settings.py backend/tests/test_inheritance_api.py backend/tests/test_plans.py -v`
预期：PASS，或仅剩与本次契约变更直接相关的可解释失败并当场修复

### 任务 2：修复公开页面链路

**文件：**

- 创建：`backend/tests/test_public_matrix.py`
- 修改：`backend/routes/public.py`
- 修改：`frontend/src/api/client.ts`
- 修改：`frontend/src/components/HistoryView.tsx`
- 修改：`frontend/src/components/MatrixTable.tsx`
- 测试：`backend/tests/test_public.py`
- 测试：`backend/tests/test_public_matrix.py`

- [ ] **步骤 1：编写失败的公开接口测试**

```python
async def test_public_matrix_no_auth(db_session):
    response = await client.get("/api/public/matrix?days=7&tz_offset=0&mode=all")
    assert response.status_code == 200

async def test_public_plan_detail_does_not_require_private_stats(...):
    response = await client.get("/api/public/results", params={"plan_id": 1})
    assert response.status_code in (200, 404)
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_public.py backend/tests/test_public_matrix.py -v`
预期：FAIL，当前 `/api/public/matrix` 不存在

- [ ] **步骤 3：实现公开矩阵和公共详情链路修复**

```python
@router.get("/matrix", response_model=list[MatrixItem])
async def public_matrix(...):
    ...
```

```tsx
if (isPublic) {
  setStats(null);
  return;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_public.py backend/tests/test_public_matrix.py -v`
预期：PASS

- [ ] **步骤 5：运行该步回归集**

运行：`uv run pytest backend/tests/test_public.py backend/tests/test_public_time_bucket.py backend/tests/test_matrix.py -v`
预期：PASS

### 任务 3：修复计划模型语义

**文件：**

- 创建：`backend/tests/test_plan_validation.py`
- 修改：`backend/models/__init__.py`
- 修改：`backend/schemas.py`
- 修改：`backend/routes/plans.py`
- 修改：`backend/services/scheduler.py`
- 修改：`frontend/src/pages/Plans/PlanDialog.tsx`
- 修改：`frontend/src/pages/Plans/PlanTable.tsx`
- 修改：`backend/tests/test_scheduler.py`
- 修改：`backend/tests/test_trigger_test.py`
- 测试：`backend/tests/test_plan_validation.py`

- [ ] **步骤 1：编写失败的模型语义测试**

```python
async def test_reject_self_parent(auth_client):
    response = await auth_client.put("/api/plans/1", json={"parent_id": 1})
    assert response.status_code == 400

async def test_reject_cycle_parent(auth_client):
    response = await auth_client.put("/api/plans/1", json={"parent_id": 3})
    assert response.status_code == 400

async def test_root_plan_without_children_runs_as_single_plan(...):
    response = await auth_client.post("/api/plans/1/test")
    assert response.status_code == 200
    assert response.json()["message"] == "Test completed"
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_plan_validation.py backend/tests/test_scheduler.py backend/tests/test_trigger_test.py -v`
预期：FAIL，当前允许错误父子结构，且 root plan 仍按 suite 行为处理

- [ ] **步骤 3：实现父子校验、suite 判定和 multiplier 约束**

```python
if body.parent_id == plan_id:
    raise HTTPException(status_code=400, detail="Plan cannot be its own parent")
```

```python
def is_suite(self) -> bool:
    return self.parent_id is None and bool(self.children)
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_plan_validation.py backend/tests/test_scheduler.py backend/tests/test_trigger_test.py -v`
预期：PASS

- [ ] **步骤 5：运行该步回归集**

运行：`uv run pytest backend/tests/test_models.py backend/tests/test_plans.py backend/tests/test_inheritance_api.py backend/tests/test_scheduler.py backend/tests/test_trigger_test.py -v`
预期：PASS

### 任务 4：修复调度与导入一致性

**文件：**

- 修改：`backend/routes/plans.py`
- 修改：`backend/services/scheduler.py`
- 修改：`backend/tests/test_scheduler.py`
- 测试：`backend/tests/test_scheduler.py`

- [ ] **步骤 1：补失败用例，锁定导入和调度同步边界**

```python
async def test_import_failure_does_not_mask_committed_state(...):
    response = await auth_client.post("/api/plans/import", json=[])
    assert response.status_code == 200
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_scheduler.py backend/tests/test_plans.py -v`
预期：FAIL，当前导入错误语义或调度状态行为不符合预期

- [ ] **步骤 3：实现最小一致性修复**

```python
try:
    await db.commit()
except SQLAlchemyError:
    ...

await sync_scheduled_jobs(db)
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_scheduler.py backend/tests/test_plans.py -v`
预期：PASS

- [ ] **步骤 5：运行该步回归集**

运行：`uv run pytest backend/tests/test_scheduler.py backend/tests/test_plans.py backend/tests/test_results.py -v`
预期：PASS

### 任务 5：索引与部署默认值整改

**文件：**

- 创建：`backend/alembic/versions/<timestamp>_add_indexes_and_constraints.py`
- 创建：`backend/alembic/versions/9b9d8c7e6f5a_add_indexes_for_results_and_plans.py`
- 修改：`docker-compose.yml`
- 修改：`backend/tests/test_settings.py`
- 测试：Alembic 迁移执行验证

- [ ] **步骤 1：编写迁移与部署相关断言**

```python
def test_settings_defaults_document_safe_secret_key_behavior():
    assert "SECRET_KEY" in open("docker-compose.yml", encoding="utf-8").read()
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_settings.py -v`
预期：FAIL，默认值或文档行为尚未调整

- [ ] **步骤 3：实现索引迁移和部署默认值收敛**

```python
op.create_index("ix_test_results_plan_created_at", "test_results", ["plan_id", "created_at"])
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_settings.py -v`
预期：PASS

- [ ] **步骤 5：运行该步回归集**

运行：`uv run pytest backend/tests/test_settings.py backend/tests/test_public.py backend/tests/test_results.py -v`
预期：PASS

### 任务 6：测速口径与调试残留清理

**文件：**

- 修改：`backend/services/speed_test.py`
- 修改：`backend/tests/test_speed_test.py`
- 修改：`backend/tests/test_stream_parser.py`
- 修改：`frontend/src/api/client.ts`
- 测试：`backend/tests/test_speed_test.py`
- 测试：`backend/tests/test_stream_parser.py`

- [ ] **步骤 1：编写失败的统计口径测试**

```python
def test_tps_content_not_reported_as_precise_content_speed():
    result = SpeedTester(timeout=10)
    assert result.timeout == 10

def test_think_tags_not_counted_as_reasoning_payload():
    parser = OpenAIParser()
    tracker = RequestTracker(time_sent=0.0)
    parser.parse_line('data: {"choices":[{"delta":{"content":"<think>a</think>b"}}]}', tracker, 0.1)
    assert tracker.char_count >= tracker.content_char_count
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_speed_test.py backend/tests/test_stream_parser.py -v`
预期：FAIL，当前实现仍保留误导性口径或调试残留

- [ ] **步骤 3：实现最小收敛**

```python
if debug_logging_enabled:
    logger.info("stream debug enabled")
```

```python
result.note = "Estimated from character ratio"
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_speed_test.py backend/tests/test_stream_parser.py -v`
预期：PASS

- [ ] **步骤 5：运行最终回归集**

运行：`uv run pytest backend/tests -v`
预期：PASS
