# README 链接新标签页打开实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使 README.md 中的外部链接在 GitHub 上支持在新标签页打开。

**架构：** 将 Markdown 格式的链接 `[text](url)` 替换为 HTML 格式的链接 `<a href="url" target="_blank">text</a>`。

**技术栈：** Markdown, HTML

---

### 任务 1：修改 README.md 中的链接

**文件：**
- 修改：`README.md`

- [x] **步骤 1：将在线状态链接改为 HTML 格式**
- [x] **步骤 2：将小米邀请链接改为 HTML 格式**
- [x] **步骤 3：将 MiniMax 优惠链接改为 HTML 格式**
- [x] **步骤 4：将 uv 文档链接改为 HTML 格式**
- [x] **步骤 5：将 docker-compose.yml 下载链接改为 HTML 格式**

- [x] **步骤 6：运行验证**
虽然 README 无法通过单元测试验证，但可以检查 HTML 语法是否正确。

- [x] **步骤 7：Commit**

```bash
git add README.md
git commit -m "fix: make README links open in new tab"
```
