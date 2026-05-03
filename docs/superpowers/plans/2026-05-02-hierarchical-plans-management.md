# 层级嵌套计划管理实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在前端实现 Token Plans 的层级嵌套展示（Provider -> Model），并确保继承配置值的一致性和删除操作的安全性。

**架构：** 后端在 API 中暴露计算后的生效值（effective fields），前端负责构建树形结构、视觉继承提示以及级联删除的二次确认。

**技术栈：** Python (FastAPI/Pydantic), React (TypeScript/TailwindCSS/shadcn/ui), SQLAlchemy.

---

### 文件结构
- 修改：`backend/schemas.py` - 扩展 `PlanResponse` 包含继承字段。
- 修改：`frontend/src/api/types.ts` (或 `src/api/plans.ts`) - 更新前端类型定义。
- 修改：`frontend/src/pages/Plans.tsx` - 重构列表渲染、编辑弹窗和删除逻辑。

---

### 任务 1：后端 API 增强 (Effective Fields)

**文件：**
- 修改：`backend/schemas.py`

- [ ] **步骤 1：在 PlanResponse 中添加 effective 字段**

```python
# 修改 backend/schemas.py 中的 PlanResponse
class PlanResponse(BaseModel):
    # ... 现有字段
    parent_id: int | None = None
    multiplier: float = 1.0
    # 新增计算字段
    effective_api_type: str | None = None
    effective_api_base: str | None = None
    effective_api_key: str | None = None # 这个会自动被 mask 逻辑处理
    effective_model: str | None = None
    effective_prompt: str | None = None
    effective_max_tokens: int | None = None
    effective_test_count: int | None = None

    model_config = {"from_attributes": True}
    # ... 现有 validator/serializer
```

- [ ] **步骤 2：运行现有测试确认无破坏**

运行：`uv run pytest backend/tests/test_plans.py`
预期：PASS

- [ ] **步骤 3：Commit**

```bash
git add backend/schemas.py
git commit -m "feat(backend): add effective configuration fields to PlanResponse"
```

---

### 任务 2：前端数据模型与树形构建

**文件：**
- 修改：`frontend/src/pages/Plans.tsx`

- [ ] **步骤 1：更新前端类型并实现树形转换逻辑**

```typescript
// 在 frontend/src/pages/Plans.tsx 中
interface PlanWithChildren extends PlanResponse {
  children: PlanWithChildren[];
}

const buildPlanTree = (plans: PlanResponse[]): PlanWithChildren[] => {
  const map: Record<number, PlanWithChildren> = {};
  const roots: PlanWithChildren[] = [];

  plans.forEach(p => {
    map[p.id] = { ...p, children: [] };
  });

  plans.forEach(p => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].children.push(map[p.id]);
    } else {
      roots.push(map[p.id]);
    }
  });

  return roots;
};
```

- [ ] **步骤 2：使用 useMemo 集成树形数据**

```typescript
// 修改 Plans 组件内部
const planTree = useMemo(() => buildPlanTree(plans), [plans]);
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/pages/Plans.tsx
git commit -m "feat(frontend): implement plan tree construction logic"
```

---

### 任务 3：UI 层级渲染重构

**文件：**
- 修改：`frontend/src/pages/Plans.tsx`

- [ ] **步骤 1：递归渲染表格行**

修改表格渲染逻辑，如果 plan 有 children，则在当前行下方渲染子行。子行增加 `pl-8` 和 `└─` 指标。

- [ ] **步骤 2：实现继承值视觉提示**

如果 `plan.api_base` 为空，显示 `plan.effective_api_base`，使用 `text-muted-foreground italic` 样式。

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/pages/Plans.tsx
git commit -m "feat(frontend): render plans in a hierarchical table with inheritance visuals"
```

---

### 任务 4：交互增强 (编辑占位符与级联删除)

**文件：**
- 修改：`frontend/src/pages/Plans.tsx`

- [ ] **步骤 1：改进编辑弹窗占位符**

当 `parent_id` 存在时，将 `api_base`, `api_key` 等输入框的 `placeholder` 设为父计划的 `effective` 值。

- [ ] **步骤 2：实现级联删除确认**

修改 `handleDelete` 逻辑。如果 `plan.children.length > 0`，显示包含子计划数量的警告信息。

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/pages/Plans.tsx
git commit -m "feat(frontend): add dynamic placeholders and cascaded delete warnings"
```

---

### 任务 5：最终验证

- [ ] **步骤 1：手动测试层级展示**
- [ ] **步骤 2：验证继承字段是否正确显示**
- [ ] **步骤 3：验证删除父计划时的警告提示**
- [ ] **步骤 4：Commit**

```bash
git commit --allow-empty -m "test: verified hierarchical plans management manually"
```
