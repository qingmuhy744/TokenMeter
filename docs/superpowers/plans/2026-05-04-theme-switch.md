# 白天黑夜主题切换 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 添加手动切换的浅色/深色主题系统，侧边栏底部添加切换按钮

**架构：** 使用 TailwindCSS v4 @variant 机制定义两套颜色变量，通过 useState + localStorage 管理主题状态

**技术栈：** React 19, TypeScript, TailwindCSS v4

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `frontend/src/index.css` | 定义 light/dark 两套主题颜色变量 |
| `frontend/src/hooks/useTheme.ts` | 主题状态管理 hook |
| `frontend/src/App.tsx` | 侧边栏添加主题切换按钮 |
| `frontend/src/main.tsx` | 初始化时应用本地存储的主题 |

---

## 任务 1：添加浅色主题 CSS 变量

**文件：** 修改 `frontend/src/index.css`

- [ ] **步骤 1：添加浅色主题变量**

在现有 `@variant dark` 后添加 `@variant light` 定义：

```css
@variant light {
  :root {
    --color-background: oklch(97.62% 0.007 233.64);
    --color-foreground: oklch(16.15% 0.014 222.50);
    --color-card: oklch(100% 0 0);
    --color-card-foreground: oklch(16.15% 0.014 222.50);
    --color-popover: oklch(100% 0 0);
    --color-popover-foreground: oklch(16.15% 0.014 222.50);
    --color-primary: oklch(65.61% 0.092 224.38);
    --color-primary-foreground: oklch(100% 0 0);
    --color-secondary: oklch(93% 0.02 270);
    --color-secondary-foreground: oklch(16.15% 0.014 222.50);
    --color-muted: oklch(95% 0.01 270);
    --color-muted-foreground: oklch(45% 0.02 270);
    --color-accent: oklch(93% 0.03 270);
    --color-accent-foreground: oklch(16.15% 0.014 222.50);
    --color-destructive: oklch(60% 0.22 25);
    --color-destructive-foreground: oklch(100% 0 0);
    --color-border: oklch(85% 0.01 270 / 0.5);
    --color-input: oklch(90% 0.01 270);
    --color-ring: oklch(65.61% 0.092 224.38 / 0.5);
    --color-chart-1: oklch(65.61% 0.092 224.38);
    --color-chart-2: oklch(70% 0.1 250);
    --color-chart-3: oklch(70% 0.12 290);
    --color-chart-4: oklch(70% 0.12 300);
    --color-chart-5: oklch(70% 0.12 200);

    --color-sidebar: oklch(98% 0.005 233);
    --color-sidebar-foreground: oklch(20% 0.01 222);
    --color-sidebar-primary: oklch(65.61% 0.092 224.38);
    --color-sidebar-primary-foreground: oklch(100% 0 0);
    --color-sidebar-accent: oklch(92% 0.02 270);
    --color-sidebar-accent-foreground: oklch(16.15% 0.014 222.50);
    --color-sidebar-border: oklch(80% 0.01 270 / 0.5);
    --color-sidebar-ring: oklch(65.61% 0.092 224.38 / 0.5);

    --color-primary: oklch(63.99% 0.093 224.37);
    --color-amber-muted: oklch(65.61% 0.092 224.38 / 0.15);
    --color-cyan: oklch(70% 0.1 200);
    --color-green: oklch(70% 0.12 150);
    --color-red: oklch(60% 0.2 25);
    --color-surface: oklch(98% 0.005 233);
    --color-elevated: oklch(100% 0 0);
  }
}
```

- [ ] **步骤 2：更新深色主题变量**

修改现有 `@variant dark` 中的变量为蓝紫色系：

```css
@variant dark {
  :root {
    --color-background: oklch(13.39% 0.011 219.06);
    --color-foreground: oklch(96.50% 0.009 222.06);
    --color-card: oklch(18% 0.012 219);
    --color-card-foreground: oklch(96.50% 0.009 222.06);
    --color-popover: oklch(18% 0.012 219);
    --color-popover-foreground: oklch(96.50% 0.009 222.06);
    --color-primary: oklch(63.99% 0.093 224.37);
    --color-primary-foreground: oklch(13% 0.01 219);
    --color-secondary: oklch(22% 0.03 267);
    --color-secondary-foreground: oklch(96.50% 0.009 222.06);
    --color-muted: oklch(22% 0.03 267);
    --color-muted-foreground: oklch(60% 0.02 267);
    --color-accent: oklch(28% 0.04 274);
    --color-accent-foreground: oklch(96.50% 0.009 222.06);
    --color-destructive: oklch(55% 0.18 25);
    --color-destructive-foreground: oklch(98% 0.01 25);
    --color-border: oklch(28% 0.02 267 / 0.5);
    --color-input: oklch(22% 0.03 267);
    --color-ring: oklch(63.99% 0.093 224.37 / 0.5);
    --color-chart-1: oklch(63.99% 0.093 224.37);
    --color-chart-2: oklch(50% 0.1 240);
    --color-chart-3: oklch(55% 0.12 280);
    --color-chart-4: oklch(55% 0.12 300);
    --color-chart-5: oklch(55% 0.1 200);

    --color-sidebar: oklch(10% 0.008 219);
    --color-sidebar-foreground: oklch(75% 0.005 222);
    --color-sidebar-primary: oklch(63.99% 0.093 224.37);
    --color-sidebar-primary-foreground: oklch(13% 0.01 219);
    --color-sidebar-accent: oklch(20% 0.025 267);
    --color-sidebar-accent-foreground: oklch(96.50% 0.009 222.06);
    --color-sidebar-border: oklch(25% 0.02 267);
    --color-sidebar-ring: oklch(63.99% 0.093 224.37 / 0.5);

    --color-primary: oklch(63.99% 0.093 224.37);
    --color-amber-muted: oklch(63.99% 0.093 224.37 / 0.15);
    --color-cyan: oklch(60% 0.1 200);
    --color-green: oklch(60% 0.12 150);
    --color-red: oklch(55% 0.2 25);
    --color-surface: oklch(15% 0.01 219);
    --color-elevated: oklch(20% 0.02 267);
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add light theme CSS variables"
```

---

## 任务 2：创建主题 Hook

**文件：** 创建 `frontend/src/hooks/useTheme.ts`

- [ ] **步骤 1：创建 useTheme hook**

```typescript
import { useState, useEffect, createContext, useContext } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('theme') as Theme;
    return stored || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export { ThemeProvider, useTheme };
export type { Theme };
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/hooks/useTheme.ts
git commit -m "feat: create useTheme hook"
```

---

## 任务 3：集成主题到 App

**文件：** 修改 `frontend/src/App.tsx`

- [ ] **步骤 1：导入 ThemeProvider 和 useTheme**

在文件顶部添加导入：

```typescript
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";
```

- [ ] **步骤 2：创建带主题切换的侧边栏底部**

在 Sidebar 组件底部语言切换旁添加主题切换按钮：

```typescript
// 在语言切换按钮后添加
<button
  onClick={toggleTheme}
  className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
>
  {theme === 'dark' ? <Sun className="size-3" /> : <Moon className="size-3" />}
  {theme === 'dark' ? '浅色' : '深色'}
</button>
```

- [ ] **步骤 3：使用 useTheme**

在 Sidebar 组件内添加：

```typescript
const { theme, toggleTheme } = useTheme();
```

- [ ] **步骤 4：包装 App 使用 ThemeProvider**

将 App 组件内容包装在 ThemeProvider 中：

```typescript
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <TooltipProvider>
            <Routes>
              {/* ... 所有路由 */}
            </Routes>
            <Toaster />
          </TooltipProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: integrate theme toggle in sidebar"
```

---

## 任务 4：初始化应用主题

**文件：** 修改 `frontend/src/main.tsx`

- [ ] **步骤 1：初始化主题**

在渲染 App 前应用本地存储的主题：

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'

// 初始化主题
const initTheme = () => {
  const stored = localStorage.getItem('theme') || 'dark';
  document.documentElement.classList.add(stored);
};
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: initialize theme on app load"
```

---

## 验证步骤

- [ ] 运行前端开发服务器 `npm run dev`
- [ ] 打开浏览器访问 localhost
- [ ] 确认侧边栏底部显示主题切换按钮
- [ ] 点击切换按钮确认主题变化
- [ ] 刷新页面确认主题状态保持
- [ ] 在移动端确认布局正常