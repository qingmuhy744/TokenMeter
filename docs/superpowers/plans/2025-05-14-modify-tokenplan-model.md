# 修改 TokenPlan 模型以支持套餐继承 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 `TokenPlan` 模型中添加 `parent_id` 和 `multiplier` 字段，建立自引用关系，并使核心 API 配置字段可选以支持继承。

**架构：** 使用 SQLAlchemy 的自引用（Self-Referential）关系。`parent_id` 指向同表的 `id`。

**技术栈：** Python, SQLAlchemy

---

### 任务 1：修改 `backend/models.py` 中的 `TokenPlan` 类

**文件：**
- 修改：`backend/models.py`
- 测试：`backend/tests/test_models.py`

- [ ] **步骤 1：编写测试验证新字段和可选性**

在 `backend/tests/test_models.py` 中添加测试用例。

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_models.py`

- [ ] **步骤 3：修改 `backend/models.py` 实现字段变更**

更新 `TokenPlan` 模型。

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_models.py`

- [ ] **步骤 5：Commit**

```bash
git add backend/models.py backend/tests/test_models.py
git commit -m "feat(models): add parent_id and multiplier to TokenPlan for inheritance"
```
