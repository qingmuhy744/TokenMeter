# Auto 主题模式设计

## 概述

在现有的浅色/深色模式基础上添加「自动模式」，根据浏览器系统设置自动切换主题。

## 需求确认

- **UI 方式**: 下拉菜单（Auto / Light / Dark），Auto 默认显示在第一位
- **响应行为**: 实时响应 — 浏览器系统主题变化时页面自动切换
- **持久化**: 保存 'system' 标记，每次页面加载时重新读取系统设置

## 实现方案

使用项目已有的 `next-themes` 库替换现有自定义 Hook。

## 组件变更

| 文件 | 变更 |
|------|------|
| `frontend/src/main.tsx` | 用 `next-themes` 的 `ThemeProvider` 替换现有初始化逻辑 |
| `frontend/src/hooks/useTheme.tsx` | 删除（不再需要） |
| `frontend/src/App.tsx` | 将切换按钮改为下拉菜单，显示当前模式图标 |
| `frontend/src/i18n/locales/zh.json` | 添加 `theme.auto` 翻译 |
| `frontend/src/i18n/locales/en.json` | 添加 `theme.auto` 翻译 |

## UI 设计

下拉菜单选项顺序：Auto → Light → Dark

```
┌─────────��───────┐
│ 🔄 自动          │ ← 默认选中
├─────────────────┤
│ ☀️ 浅色          │
├─────────────────┤
│ 🌙 深色          │
└─────────────────┘
```

## 数据流

```
用户选择 → setTheme('system') → next-themes 监听 →
  → 检测 prefers-color-scheme → 添加/移除 dark class
```

- localStorage 键名保持 `theme`，值为 `'light'` / `'dark'` / `'system'`
- 页面加载时读取 localStorage，恢复用户上次选择