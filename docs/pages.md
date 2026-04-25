# pages.md — 页面清单

3 个核心页面 + 1 个静态页，每页一句话职责 + 截图路径。

---

## 核心（3 个）

### 01 · 统一画布（首屏，PipelineView）
- **职责**：用户首次访问的默认页面。粘贴 URL / 直接深入 / 原文粘贴 → parse 卡 → 双击进 ParseDetailSheet → 深入追问（Q/A 合并卡）→ answer 卡可触发 experiment 节点
- **关键元素**：input/parse/question/answer/experiment 节点（左边条按类型染色）、bezier 连线 + liveStatus、SaveExcerptDialog（左键拖选 → 右键 § 存入 Wiki）、右侧 Minimap
- **截图**：`screenshots/03-pipeline.png`

### 02 · Wiki + 经验（双 tab，WikiBrowseView）
- **职责**：列表层顶部 tab 切「Wiki / 经验」。Wiki 是分类 chip 过滤的扁平卡片墙，详情可编辑；经验是沉淀自画布实验节点的可复用方案，手风琴折叠
- **关键元素**：tab 切换、分类管理面板、卡片墙 / 经验展开行（含 Coze 调用记录）、详情 markdown 渲染
- **截图**：`screenshots/04-wiki-categories.png`、`screenshots/04-wiki-detail.png`、`screenshots/07-experience-list.png`

### 03 · 运行原理（BlueprintView）
- 静态说明页，解释 Agent 的工作流。
- 截图：`screenshots/08-blueprint.png`（可选）

---

## 截图采集说明

每张截图请在浏览器里手动抓（推荐：⌘+Shift+4 拖框）。
**重点**：在每张图上用任意标注工具（Skitch / Preview 标注 / Cleanshot）圈出**你不喜欢的地方**，加一两个字说明。
例如：「这里太空」「卡片之间气质割裂」「色块太重」「按钮位置不对」。

不需要圈完美 —— Claude Design 看圈注就知道你的痒点。
