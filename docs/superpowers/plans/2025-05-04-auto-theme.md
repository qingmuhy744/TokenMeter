# Auto 主题模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 在现有的浅色/深色模式基础上添加「自动模式」，根据浏览器系统设置自动切换主题。

**架构:** 使用 `next-themes` 库替换现有的自定义 `useTheme` Hook，提供 light/dark/system 三种模式。

**技术栈:** React 19, TypeScript, next-themes, @base-ui/react/select

---

### Task 1: 更新 main.tsx 使用 next-themes ThemeProvider

**Files:**
- Modify: `frontend/src/main.tsx:7-14`

- [ ] **Step 1: 替换初始化逻辑**

删除现有的 `initTheme` 函数调用，改为导入 next-themes 的 ThemeProvider。

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import './i18n'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: 提交更改**

```bash
git add frontend/src/main.tsx && git commit -m "refactor: 使用 next-themes ThemeProvider 替换自定义初始化"
```

---

### Task 2: 删除自定义 useTheme Hook

**Files:**
- Delete: `frontend/src/hooks/useTheme.tsx`

- [ ] **Step 1: 删除文件**

```bash
rm frontend/src/hooks/useTheme.tsx
```

- [ ] **Step 2: 提交更改**

```bash
git add -A && git commit -m "refactor: 删除自定义 useTheme Hook，改用 next-themes"
```

---

### Task 3: 添加 i18n 翻译

**Files:**
- Modify: `frontend/src/i18n/locales/zh.json:246-250`
- Modify: `frontend/src/i18n/locales/en.json:247-251`

- [ ] **Step 1: 添加中文翻译**

```json
"theme": {
  "auto": "自动",
  "light": "浅色",
  "dark": "深色"
}
```

- [ ] **Step 2: 添加英文翻译**

```json
"theme": {
  "auto": "Auto",
  "light": "Light",
  "dark": "Dark"
}
```

- [ ] **Step 3: 提交更改**

```bash
git add frontend/src/i18n/locales/ && git commit -m "i18n: 添加 theme.auto 翻译"
```

---

### Task 4: 更新 App.tsx 主题切换按钮为下拉菜单

**Files:**
- Modify: `frontend/src/App.tsx:1-60`
- Modify: `frontend/src/App.tsx:140-165`

- [ ] **Step 1: 添加导入**

从 `lucide-react` 添加 `Monitor` 图标（用于 Auto 模式）：
```typescript
import {
  // ... existing
  Monitor,
} from "lucide-react";
```

添加 next-themes 的 useTheme：
```typescript
import { useTheme } from "next-themes";
```

- [ ] **Step 2: 替换主题切换逻辑**

在 Sidebar 组件中，找到主题切换按钮区域（约第 148-154 行），替换为下拉菜单：

```typescript
const { theme, setTheme } = useTheme();

const themeOptions = [
  { value: 'system', label: t('theme.auto'), icon: Monitor },
  { value: 'light', label: t('theme.light'), icon: Moon },
  { value: 'dark', label: t('theme.dark'), icon: Sun },
];

const currentOption = themeOptions.find(o => o.value === theme) || themeOptions[0];
const CurrentIcon = currentOption.icon;
```

替换按钮 JSX：
```typescript
<div className="relative">
  <button
    className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
  >
    <CurrentIcon className="size-3" />
    {currentOption.label}
  </button>
  <div className="absolute bottom-full left-0 mb-1 bg-sidebar border border-border rounded-lg shadow-lg overflow-hidden hidden group-hover:block">
    {themeOptions.map((option) => {
      const Icon = option.icon;
      return (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
            theme === option.value
              ? "bg-sidebar-foreground/10 text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
          )}
        >
          <Icon className="size-3" />
          {option.label}
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: 提交更改**

```bash
git add frontend/src/App.tsx && git commit -m "feat: 主题切换按钮改为下拉菜单，支持 Auto 模式"
```

---

### Task 5: 验证功能

**Files:**
- Test: 手动测试

- [ ] **Step 1: 运行开发服务器**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: 测试主题���换**

- 打开浏览器开发者工具
- 点击主题切换下拉菜单
- 验证 Auto / Light / Dark 模式都能正常切换
- 验证选择 Auto 时，修改系统主题设置，页面自动跟随变化

- [ ] **Step 3: 测试持久化**

- 刷新页面，验证上次选择的主题模式被正确恢复

- [ ] **Step 4: 提交完成**

```bash
git add -A && git commit -m "test: 验证 Auto 主题模式功能正常"
```

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2025-05-04-auto-theme.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**