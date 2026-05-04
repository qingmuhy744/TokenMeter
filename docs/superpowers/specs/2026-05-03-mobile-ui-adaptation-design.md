# TokenMeter 移动端适配与 Claude 风格重构设计规格

**目标**：将 TokenMeter 的 UI 整体升级为类似 Claude (Artifacts) 的极简、现代、高呼吸感风格，并彻底解决移动端表格难以操作的问题。

## 1. 视觉语言 (Foundational Layer)

### 1.1 色彩系统
- **全局背景 (Surface)**: `oklch(0.98 0.01 240)` / `#f8fafc` (Slate 50)
- **卡片/容器 (Content)**: `oklch(1 0 0)` / `#ffffff` (White)
- **主文字 (Foreground)**: `oklch(0.2 0.02 240)` / `#0f172a` (Slate 900)
- **次要文字 (Muted)**: `oklch(0.55 0.02 240)` / `#64748b` (Slate 500)
- **边框 (Stroke)**: `oklch(0.92 0.01 240 / 0.6)` / `border-slate-200/60`

### 1.2 几何与阴影
- **大圆角 (Radius)**: 容器 `1rem` (rounded-2xl), 元素 `0.75rem` (rounded-xl)
- **微阴影 (Elevated)**: `shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]`

## 2. 响应式布局策略 (Responsive Architecture)

### 2.1 统一侧边栏 (Sidebar)
- **桌面**: 常驻，极简 Slate 背景，活动项使用 `bg-slate-900 text-white` 或深灰高亮。
- **移动**: 汉堡菜单抽屉。

### 2.2 测速计划 (Plans Page)
- **桌面 (Refined Table)**:
  - 增加行高，移除垂直分割线。
  - 父子关系通过缩进和柔和的连接线 (`L` 型) 表示。
- **移动 (Card-List)**:
  - 每一个 Provider 为一个 `Card`。
  - 内部模型以 `Divider` 分隔的列表项呈现。
  - 关键操作（测试/编辑）在移动端优先通过滑动手势或底部 Action Bar 提供。

### 2.3 性能矩阵 (Matrix Page)
- **桌面 (Soft Heatmap)**: 保持 Table 结构，但单元格颜色使用低饱和度配色。
- **移动 (Metric Tiles)**:
  - 采用 2 列或 1 列的网格布局。
  - 每个 Tile 显示：模型名、大号 TTFT 数值、大号 TPS 数值。
  - 背景色块根据性能等级采用极淡的着色（Heatmap-lite）。

## 3. 技术实现 (Technical Implementation)

### 3.1 CSS 变量更新
更新 `index.css` 的 `@theme` 部分，引入更符合 Slate 系的色彩和圆角。

### 3.2 组件模式
在 `PlanTable.tsx` 和 `MatrixTable.tsx` 中使用：
```tsx
<div className="hidden md:block">
  {/* 桌面端表格 */}
</div>
<div className="block md:hidden">
  {/* 移动端卡片布局 */}
</div>
```

## 4. 验证标准 (Success Criteria)
- 移动端不再出现横向滚动条（性能矩阵除外，其内部图表应自适应）。
- 整体视觉具有明显的“纸质感”和“空气感”。
- 关键操作在 300px 宽度的屏幕上依然清晰可点。
