# Plan Suites 与彩色大盘实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现模型套餐（Plan Suites）功能，减少配置重复，并提供一个基于本地时区、高信息密度的彩色热力大盘。

**架构：** 
- **Backend:** `TokenPlan` 改为自引用表。调度器改为按套餐（Suite）轮询子模型。新增矩阵数据聚合接口。
- **Frontend:** 重构 Dashboard 为彩色矩阵表格，使用 `oklch` 颜色变量。基于浏览器本地时区计算昼夜差值。

**技术栈：** Python (FastAPI/SQLAlchemy), React (TypeScript/TailwindCSS v4), Shadcn/UI, Recharts.

---

## 阶段 1：数据库模型与平滑迁移

### 任务 1：修改 TokenPlan 模型
**文件：**
- 修改：`backend/models.py`

- [ ] **步骤 1：添加 parent_id 和 multiplier 字段**

```python
# backend/models.py
class TokenPlan(Base):
    # ... 现有字段 ...
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("token_plans.id"), nullable=True
    )
    multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    
    # 关系定义
    parent: Mapped["TokenPlan | None"] = relationship(
        "TokenPlan", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["TokenPlan"]] = relationship(
        "TokenPlan", back_populates="parent", cascade="all, delete-orphan"
    )
    # ...
```

- [ ] **步骤 2：允许配置字段为 Null（支持继承）**
将 `api_type`, `api_base`, `api_key`, `model` 改为可选（但逻辑上至少其中一处有值）。

### 任务 2：编写并运行平滑迁移
**文件：**
- 修改：`backend/migrations/manager.py`

- [ ] **步骤 1：添加 SQL 迁移 (0.3.0)**
增加 `parent_id` 和 `multiplier` 列。

- [ ] **步骤 2：添加数据转换函数 `convert_to_suites` (0.3.1)**
遍历所有没有 `parent_id` 的活跃计划，将它们转化为“套餐”，并创建一个对应的“子模型”。

```python
async def convert_to_suites(db):
    result = await db.execute(select(TokenPlan).where(TokenPlan.parent_id == None))
    plans = result.scalars().all()
    for p in plans:
        if not p.model: continue
        # 创建一个子项承接原有的模型配置
        child = TokenPlan(
            name=p.name,
            model=p.model,
            parent_id=p.id,
            multiplier=1.0,
            is_active=p.is_active
        )
        p.model = "" # 套餐本身不带模型名
        db.add(child)
    await db.commit()
```

---

## 阶段 2：后端调度与业务逻辑

### 任务 3：重写配置继承逻辑
**文件：**
- 修改：`backend/models.py` (添加 helper 方法)

- [ ] **步骤 1：在 TokenPlan 类中添加继承方法 `effective_config`**

```python
def get_config(self, field):
    val = getattr(self, field)
    if val is None and self.parent_id:
        return getattr(self.parent, field)
    return val
```

### 任务 4：升级调度器支持套餐轮询
**文件：**
- 修改：`backend/services/scheduler.py`

- [ ] **步骤 1：修改 `sync_scheduled_jobs` 只为 parent 为空的项注册任务。**
- [ ] **步骤 2：重构 `run_speed_test`（改为 `run_suite_test`）**：
    - 获取所有活跃子项。
    - 遍历子项，根据 `multiplier` 判定。
    - 顺序执行测试，使用 `asyncio.sleep`。
    - 确保结果 `plan_id` 关联子项。

---

## 阶段 3：接口层重构

### 任务 5：实现彩色大盘聚合接口
**文件：**
- 创建：`backend/routes/results.py` (或修改现有)

- [ ] **步骤 1：实现 `GET /api/results/matrix`**
    - 按 `plan_id` 聚合。
    - 分别统计 `08:00-20:00` (Day) 和其他时间 (Night) 的均值。
    - **注意**：时区在 SQL 聚合时是个挑战，考虑拉回应用层进行时区转换后再聚合，或在前端处理。

---

## 阶段 4：前端 UI 重构

### 任务 6：实现 Matrix Dashboard
**文件：**
- 创建：`frontend/src/pages/DashboardMatrix.tsx`
- 修改：`frontend/src/App.tsx` (路由切换)

- [ ] **步骤 1：使用 TanStack Table 实现可排序表格。**
- [ ] **步骤 2：实现热力着色逻辑。**
    - 使用 `oklch` 颜色系统（如 `bg-[oklch(0.8_0.2_145)]` 代表绿色）。

### 任务 7：详情页昼夜阴影背景
**文件：**
- 修改：`frontend/src/components/SpeedChart.tsx`

- [ ] **步骤 1：在 Recharts 中使用 `<ReferenceArea>` 渲染白天/夜间阴影背景。**

---

## 验证与自检

- [ ] **数据库自检**：运行迁移后，`token_plans` 表行数应翻倍（一父一子）。
- [ ] **调度自检**：查看日志，确认模型是顺序执行而非并发，且中间有随机秒数的休眠。
- [ ] **前端自检**：在不同本地时间查看“劣化率”列，颜色应符合预期。
