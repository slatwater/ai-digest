# pages.md — 页面清单

5 个 P0 页面 + 1 个 P1 页面，每页一句话职责 + 截图路径。

---

## P0（必做，5 个）

### 01 · 解析空态（首屏）
- **职责**：用户首次访问看到的页面。粘贴一批链接 → 点解析按钮 → 进入解析进度
- **关键元素**：粘贴框（textarea）、模型切换（sonnet / opus 4.6 / opus 4.7）、解析按钮
- **截图**：`screenshots/01-triage-empty.png`
- **次级状态**：`screenshots/01-triage-empty-with-urls.png`（粘贴了几条链接后，模型切换出现）

### 02 · 解析卡片列表
- **职责**：显示批量解析的结果。每张卡片含：标题、概念标签、叙述、来源链接、内置聊天
- **关键元素**：卡片头部、概念 chip、narrative 段落（含 [[]] 内嵌链接）、来源列表、内置聊天框
- **截图**：`screenshots/02-triage-cards.png`
- **次级状态**：`screenshots/02-triage-cards-processing.png`（部分卡片仍在解析中）

### 03 · 深入提问对话（PipelineView）
- **职责**：从解析卡片进入的多轮深入研究对话
- **关键元素**：折叠的解析摘要、问答块（Q + 流式 A + 模型标签）、底部输入 + 模型切换
- **截图**：`screenshots/03-pipeline.png`

### 04 · Wiki 浏览
- **职责**：三级钻取：分类 → 条目列表 → 详情。详情可编辑、可导入 skill
- **关键元素**：分类网格 / 条目列表 / 详情 markdown 渲染
- **截图**：`screenshots/04-wiki-categories.png`、`screenshots/04-wiki-detail.png`

### 05 · Skill 沙盒
- **职责**：选 Wiki 条目 → 启动沙盒 → 对话 + 工具调用执行 skill
- **关键元素**：选择条目阶段、运行阶段（聊天 + 工具轨迹折叠）
- **截图**：`screenshots/05-sandbox-select.png`、`screenshots/05-sandbox-run.png`

---

## P1（次做，2 个）

### 06 · 实验（ExperimentView）
- **职责**：多选 Wiki → 研究员对话 → coze CLI 验证 → 存经验
- **关键元素**：素材选择、聊天区、Coze 运行折叠面板、工具轨迹折叠面板
- **截图**：`screenshots/06-experiment.png`

### 07 · 经验（ExperienceView）
- **职责**：沉淀的实验产物列表。手风琴折叠展开
- **关键元素**：折叠的列表项、展开后的 markdown 详情、Coze 调用记录折叠
- **截图**：`screenshots/07-experience-list.png`、`screenshots/07-experience-expanded.png`

---

## P2（以后再说）

### 08 · 运行原理（BlueprintView）
- 静态说明页，解释 Agent 的工作流。优先级最低
- 截图：`screenshots/08-blueprint.png`（可选）

---

## 截图采集说明

每张截图请在浏览器里手动抓（推荐：⌘+Shift+4 拖框）。
**重点**：在每张图上用任意标注工具（Skitch / Preview 标注 / Cleanshot）圈出**你不喜欢的地方**，加一两个字说明。
例如：「这里太空」「卡片之间气质割裂」「色块太重」「按钮位置不对」。

不需要圈完美 —— Claude Design 看圈注就知道你的痒点。
