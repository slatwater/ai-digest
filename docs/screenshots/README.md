# 截图清单

`scripts/capture-screens.mjs` 自动抓的 9 张：

| 文件 | 视图 |
|------|------|
| `01-triage-empty.png` | 解析空态（首屏） |
| `01-triage-empty-with-urls.png` | 粘贴链接后（模型切换出现） |
| `04-wiki-categories.png` | Wiki 分类网格 |
| `04-wiki-items.png` | Wiki 分类下条目列表 |
| `04-wiki-detail.png` | Wiki 条目详情（含编辑） |
| `05-sandbox-select.png` | 沙盒条目选择阶段 |
| `06-experiment.png` | 实验视图 |
| `07-experience-list.png` | 经验列表（折叠态） |
| `07-experience-expanded.png` | 经验列表（一条展开） |

## 还缺 2 张（需要真实数据，下次跑一遍解析时手动补）

| 文件 | 怎么抓 |
|------|--------|
| `02-triage-cards.png` | 跑一次真实链接解析，截结果卡片列表 |
| `03-pipeline.png` | 从卡片点「深入」进入对话，问一两轮，截带 Q&A 的状态 |

⌘+Shift+4 拖框存到本目录即可。

## 重新生成
```bash
node scripts/capture-screens.mjs
```
（dev server 必须在 3003 端口跑着）

## 标注（可选但强烈推荐）
在每张图上用 CleanShot / Skitch / Preview 圈出**你不喜欢的地方** + 一句话说明。
不需要圈完美 —— 圈得越具体越主观，Claude Design 越能 nail 你的方向。
