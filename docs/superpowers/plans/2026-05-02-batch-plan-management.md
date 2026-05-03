# 批量计划管理实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现模型批量导入功能，包括在现有弹窗中支持逗号分割模型名，以及提供一个专门的文本/JSON 批量编辑器。

**架构：** 前端拦截提交请求，识别批量格式后进行循环异步调用；新增 BatchImportDialog 组件处理复杂导入逻辑。

**技术栈：** React, TypeScript, Lucide Icons, Sonner (Toast).

---

### 文件结构
- 创建：`frontend/src/pages/Plans/BatchImportDialog.tsx` - 批量编辑器组件。
- 修改：`frontend/src/pages/Plans/index.tsx` - 集成批量提交逻辑和入口按钮。
- 修改：`frontend/src/pages/Plans/PlanDialog.tsx` - 优化 UI 兼容性。
- 修改：`frontend/src/i18n/locales/zh.json` & `en.json` - 补全翻译。

---

### 任务 1：i18n 补全

**文件：**
- 修改：`frontend/src/i18n/locales/zh.json`
- 修改：`frontend/src/i18n/locales/en.json`

- [ ] **步骤 1：增加批量操作相关的翻译项**

```json
// zh.json -> plans 节点
"batchAction": "批量操作",
"batchImport": "批量导入",
"importMode": "导入模式",
"textMode": "文本列表",
"jsonMode": "JSON 代码",
"modelListPlaceholder": "每行一个模型名称，例如：\ngpt-4o\ngpt-4-turbo",
"jsonPlaceholder": "粘贴 JSON 配置数组...",
"parsing": "正在解析...",
"importing": "正在导入 {{current}}/{{total}}...",
"importSuccess": "成功导入 {{count}} 个计划",
"invalidJson": "JSON 格式错误"
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/i18n/locales/*.json
git commit -m "docs(i18n): add translations for batch import features"
```

---

### 任务 2：实现智能逗号拆分逻辑

**文件：**
- 修改：`frontend/src/pages/Plans/index.tsx`

- [ ] **步骤 1：重构 handleSubmit 以支持多模型拆分**

```typescript
// 修改 frontend/src/pages/Plans/index.tsx 中的 handleSubmit
const handleSubmit = async () => {
  try {
    const models = form.model.split(/[，,]/).map(m => m.trim()).filter(m => m !== "");
    
    if (!editingId && models.length > 1) {
      // 批量创建模式
      for (let i = 0; i < models.length; i++) {
        const m = models[i];
        toast.info(t("plans.importing", { current: i + 1, total: models.length }));
        const parentName = plans.find(p => p.id === form.parent_id)?.name || "Plan";
        await api.createPlan({
          ...form,
          name: `${parentName} (${m})`,
          model: m
        });
      }
      toast.success(t("plans.importSuccess", { count: models.length }));
    } else {
      // 原有单体创建/更新逻辑
      if (editingId) {
        const { api_key, ...rest } = form;
        const payload = originalKey !== api_key ? { ...rest, api_key } : rest;
        await api.updatePlan(editingId, payload);
        toast.success(t("plans.planUpdated"));
      } else {
        await api.createPlan(form);
        toast.success(t("plans.planCreated"));
      }
    }
    setOpen(false); setForm(defaultForm); setEditingId(null); loadPlans();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
};
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/pages/Plans/index.tsx
git commit -m "feat(plans): support batch creation via comma-separated model names"
```

---

### 任务 3：开发高级批量编辑器组件

**文件：**
- 创建：`frontend/src/pages/Plans/BatchImportDialog.tsx`

- [ ] **步骤 1：编写 BatchImportDialog 基础结构**
包含模式切换（文本/JSON）、Provider 选择和提交逻辑。

- [ ] **步骤 2：实现文本解析逻辑**
按行分割，自动生成名称并调用接口。

- [ ] **步骤 3：实现 JSON 解析逻辑**
支持 JSON.parse 校验并批量映射字段。

- [ ] **步骤 4：Commit**

```bash
git add frontend/src/pages/Plans/BatchImportDialog.tsx
git commit -m "feat(plans): add advanced BatchImportDialog with Text and JSON modes"
```

---

### 任务 4：主页面集成与构建验证

**文件：**
- 修改：`frontend/src/pages/Plans/index.tsx`

- [ ] **步骤 1：在顶部添加“批量导入”按钮**
使用 ListPlus 图标，点击打开 BatchImportDialog。

- [ ] **步骤 2：运行构建验证**
运行 cd frontend && npm run build。

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/pages/Plans/index.tsx
git commit -m "feat(plans): integrate batch import button into main UI"
```

---

### 任务 5：最终清理与验证

- [ ] **步骤 1：验证所有翻译显示正常**
- [ ] **步骤 2：测试 JSON 导入的错误拦截**
- [ ] **步骤 3：Commit**

```bash
git commit --allow-empty -m "test: verified all batch import scenarios"
```
