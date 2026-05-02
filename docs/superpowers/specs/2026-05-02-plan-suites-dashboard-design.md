# 规格说明：模型套餐（Plan Suites）与多维性能矩阵大盘

## 1. 概述
TokenMeter 目前每个测试计划（Plan）都是独立的，导致管理多个模型时配置重复。本设计引入“模型套餐（Suite）”概念实现配置继承与顺序测试，并重构前端大盘为高信息密度的彩色热力矩阵，支持昼夜性能对比。

## 2. 用户场景
- **配置复用：** 在“OpenAI 套餐”配置一次 API Key，即可在该套餐下添加多个模型（GPT-4o, GPT-3.5 等）。
- **性能监控：** 通过大盘颜色一眼看出哪个模型在白天（高峰期）发生了性能劣化。
- **调度控制：** 为不同模型设置不同倍率，例如核心模型每 10 分钟测一次，非核心模型每小时测一次。

## 3. 系统架构

### 3.1 数据模型 (Backend)
重构 `TokenPlan` 模型为自引用结构：
- **`parent_id` (FK, nullable):** 指向父级 `token_plans.id`。
    - `NULL`: 顶级项（套餐 Suite）。
    - `NOT NULL`: 子项（具体模型 Model）。
- **`multiplier` (Float, default=1.0):** 仅子项有效。
- **配置继承逻辑 (Option B):**
    - 子项执行测试时，如果自身的 `api_key`, `prompt`, `max_tokens` 等字段为 `NULL`，则向上查询父项的值。
- **数据迁移：**
    - 现有独立计划 `P` $\rightarrow$ 转化为一个新的 `Suite` (ID=P)。
    - 创建一个新的子项 `C` (parent_id=P)，继承 `P` 原有的 `model` 字段。

### 3.2 调度逻辑 (Scheduler)
- **注册对象：** APScheduler 仅为 `parent_id IS NULL` 且 `is_active = True` 的项注册任务。
- **执行流程 (`run_suite_task`):**
    1. 检索所有活跃子模型。
    2. **倍率判定**：`current_tick % (1/multiplier) == 0`。
    3. **顺序队列**：将符合条件的子模型排队，循环执行。
    4. **随机间隔**：子模型测试间隙 `await asyncio.sleep(random.uniform(2, 10))`。
    5. **结果关联**：`test_results.plan_id` 始终关联子模型 ID。

### 3.3 前端大盘 (Advanced Dashboard)

#### A. 彩色热力矩阵 (Matrix Table)
支持全列排序，包含以下列：
1. **模型名称**：显示为 `套餐名 > 子模型名`。
2. **状态**：显示最近一次勾/叉 + 24h 迷你趋势图 (Sparkline)。
3. **TTFT (均值)**：所选时间窗口内的平均首字延迟。
4. **TPS-Overall (均值)**：平均总吞吐量。
5. **TPS-Generate (均值)**：平均纯生成速度（不含 TTFT）。
6. **昼夜差值 (劣化率)**：`(白天均值 - 夜间均值) / 夜间均值`。
    - 白天界定：`08:00 - 20:00`（按浏览器本地时区）。
    - 颜色填充：基于阈值自动着色（绿/黄/红）。
7. **成功率**：请求成功比例。

#### B. 详情视图 (Drill-down)
- **阴影趋势图**：背景通过浅色背景块标识白天/夜间。
- **原始数据表**：包含 TTFB, TTFR, Think Duration, Ping 等所有详细指标。

## 4. 接口设计
- `GET /api/plans/suites`: 返回嵌套结构的套餐列表。
- `GET /api/results/matrix?days=7`: 返回按模型聚合的统计数据，包括昼夜对比结果。

## 5. 成功标准
- [x] 实现 `TokenPlan` 的自引用结构与配置继承。
- [x] 调度器支持套餐内顺序轮询与倍率控制。
- [x] 前端大盘重构为高性能、可排序的彩色热力矩阵。
- [x] 支持基于本地时区的昼夜性能对比统计。