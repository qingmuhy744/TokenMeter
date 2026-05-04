# 移动端适配与 Claude 风格重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 TokenMeter 升级为 Claude 风格的极简响应式 UI。

**架构：**
1.  **全局样式层**：通过 Tailwind CSS 变量确立 Slate-50 背景和自定义微阴影。
2.  **响应式组件层**：在关键页面实现 `Desktop Table` 与 `Mobile Card/Grid` 的条件渲染。
3.  **视觉统一层**：全量更新圆角 (2xl) 和文字层级。

**技术栈：** React 19, Tailwind CSS v4, Lucide React, shadcn/ui

---

### 任务 1：确立视觉基础 (CSS & Global Styles)

**文件：**
- 修改：`frontend/src/index.css`

- [ ] **步骤 1：更新主题变量**
将背景色设为 Slate-50 风格，微调边框色。
```css
/* index.css */
--color-background: oklch(0.985 0.001 240); /* #f8fafc */
--color-card: oklch(1 0 0);
--color-border: oklch(0.92 0.005 240 / 0.6);
--radius-2xl: 1rem;
--shadow-sm: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04);
```

- [ ] **步骤 2：验证全局背景**
确保页面底色已变为淡灰色，且卡片（如有）在视觉上产生浮动感。

- [ ] **步骤 3：Commit**
```bash
git add frontend/src/index.css
git commit -m "style: set foundational Claude-style theme variables"
```

---

### 2：布局重构 (Sidebar & Header)

**文件：**
- 修改：`frontend/src/App.tsx`

- [ ] **步骤 1：重写 Sidebar 样式**
使用更柔和的边框，活动项改为 `bg-slate-900 text-white`。

- [ ] **步骤 2：优化移动端 Header**
增加模糊背景 (`backdrop-blur-md`) 和细微边框。

- [ ] **步骤 3：验证响应式切换**
在 768px 断点处验证侧边栏的隐藏/显示逻辑。

- [ ] **步骤 4：Commit**
```bash
git add frontend/src/App.tsx
git commit -m "refactor: polish responsive sidebar and header for Claude-style"
```

---

### 任务 3：响应式测速计划列表 (PlanTable)

**文件：**
- 修改：`frontend/src/pages/Plans/PlanTable.tsx`
- 修改：`frontend/src/pages/Plans/index.tsx`

- [ ] **步骤 1：重构桌面端表格**
移除所有垂直边框，增大 `py-5` 间距，优化父子层级视觉连接。

- [ ] **步骤 2：实现移动端卡片视图**
为手机端编写 `MobilePlanCard` 组件，每个 Provider 一个卡片，子模型嵌套。

- [ ] **步骤 3：验证操作可用性**
确保移动端卡片上的“测试”、“编辑”按钮易于点击。

- [ ] **步骤 4：Commit**
```bash
git add frontend/src/pages/Plans/
git commit -m "feat: implement responsive card view for plans"
```

---

### 任务 4：响应式性能矩阵 (MatrixTable)

**文件：**
- 修改：`frontend/src/components/MatrixTable.tsx`

- [ ] **步骤 1：重构移动端磁贴布局**
在窄屏下，将表格转为 `grid-cols-1 sm:grid-cols-2` 的磁贴。

- [ ] **步骤 2：优化大号指标展示**
磁贴中 TTFT 和 TPS 使用 Claude 风格的大号加粗字体。

- [ ] **步骤 3：验证横向滚动移除**
确保移动端主容器不再出现非预期的横向滚动。

- [ ] **步骤 4：Commit**
```bash
git add frontend/src/components/MatrixTable.tsx
git commit -m "feat: implement mobile-friendly metric tiles for matrix"
```

---

### 任务 5：全量视觉润色 (Dashboard, History, Settings)

**文件：**
- 修改：`frontend/src/pages/Dashboard.tsx`
- 修改：`frontend/src/pages/History.tsx`
- 修改：`frontend/src/pages/Settings.tsx`

- [ ] **步骤 1：更新卡片样式**
确保所有页面的 `Card` 组件均使用 `rounded-2xl` 和新的微阴影。

- [ ] **步骤 2：统一列表行高**
在历史记录页面应用响应式列表优化。

- [ ] **步骤 3：运行 lint 检查**
`npm run lint --prefix frontend`

- [ ] **步骤 4：Commit**
```bash
git add frontend/src/pages/
git commit -m "style: final polish for all pages to match Claude Design System"
```
