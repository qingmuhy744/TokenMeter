# 重写配置继承逻辑 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 `TokenPlan` 类中实现配置字段的继承逻辑，使子计划能自动获取父级（套餐）的 API 配置。

**架构：** 在 `TokenPlan` 模型中添加 `get_effective_value` 方法和一系列 `effective_*` 属性。使用递归逻辑支持多级继承。

**技术栈：** Python, SQLAlchemy, pytest

---

### 任务 1：为 TokenPlan 编写继承逻辑测试

**文件：**
- 修改：`backend/tests/test_models.py`

- [x] **步骤 1：在 `backend/tests/test_models.py` 中编写失败的测试**

```python
@pytest.mark.asyncio
async def test_token_plan_effective_properties(db_session: AsyncSession):
    # 创建父计划 (套餐)
    parent = TokenPlan(
        name="Parent Plan",
        api_type="openai",
        api_base="https://api.openai.com/v1",
        api_key="sk-parent",
        model="gpt-4",
        max_tokens=512,
        test_count=5
    )
    db_session.add(parent)
    await db_session.commit()

    # 创建子计划，大部分字段继承
    child = TokenPlan(
        name="Child Plan",
        parent_id=parent.id,
        api_type=None,
        api_base=None,
        api_key=None,
        model=None,
        # 假设我们将这些也设为 None 以测试继承
        max_tokens=None,
        test_count=None
    )
    db_session.add(child)
    await db_session.commit()

    # 重新加载并预加载 parent
    stmt = (
        select(TokenPlan)
        .options(selectinload(TokenPlan.parent))
        .where(TokenPlan.id == child.id)
    )
    result = await db_session.execute(stmt)
    child_loaded = result.scalar_one()

    # 验证有效值继承
    assert child_loaded.effective_api_type == "openai"
    assert child_loaded.effective_api_base == "https://api.openai.com/v1"
    assert child_loaded.effective_api_key == "sk-parent"
    assert child_loaded.effective_model == "gpt-4"
    assert child_loaded.effective_max_tokens == 512
    assert child_loaded.effective_test_count == 5
```

- [x] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_models.py`
预期：FAIL，报错 "AttributeError: 'TokenPlan' object has no attribute 'effective_api_type'"

### 任务 2：实现 TokenPlan 继承逻辑

**文件：**
- 修改：`backend/models.py`

- [x] **步骤 1：修改 `TokenPlan` 中的字段定义（可选，如果需要支持 `max_tokens` 等继承）**

将 `max_tokens` 和 `test_count` 改为 `Mapped[int | None]`。

- [x] **步骤 2：添加助手方法和属性**

```python
    def get_effective_value(self, field_name: str):
        """获取生效的配置值（支持继承）"""
        val = getattr(self, field_name)
        if val is None and self.parent_id is not None and self.parent:
            return self.parent.get_effective_value(field_name)
        return val

    @property
    def effective_api_key(self):
        return self.get_effective_value("api_key")

    @property
    def effective_api_base(self):
        return self.get_effective_value("api_base")

    @property
    def effective_api_type(self):
        return self.get_effective_value("api_type")

    @property
    def effective_model(self):
        return self.get_effective_value("model")

    @property
    def effective_prompt(self):
        return self.get_effective_value("prompt")

    @property
    def effective_max_tokens(self):
        return self.get_effective_value("max_tokens")

    @property
    def effective_test_count(self):
        return self.get_effective_value("test_count")
```

- [x] **步骤 3：运行测试验证通过**

运行：`uv run pytest backend/tests/test_models.py`
预期：PASS

- [x] **步骤 4：Commit**

```bash
git add backend/models.py backend/tests/test_models.py
git commit -m "feat(models): implement configuration inheritance for TokenPlan"
```
