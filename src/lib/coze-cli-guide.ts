// Coze CLI 使用说明（注入到 experiment agent 的 system prompt）
// 扒自 `coze --help` + 各级子命令的 --help，精简保留必要 API。
// 若 coze 版本升级导致参数变化，更新此文件即可，不需改 agent 代码。

export const COZE_CLI_GUIDE = `# Coze CLI 使用手册（agent 内嵌版）

二进制路径：\`/opt/homebrew/bin/coze\`。所有命令都支持 \`--format json\`（默认 text）——建议脚本/解析场景统一加 \`--format json\` 方便提取结果。

## 全局 flags（所有子命令都可用）
- \`--format <json|text>\`：输出格式，默认 text；需要解析结果就加 \`--format json\`
- \`--org-id <id>\`：覆盖默认 org
- \`--space-id <id>\`：覆盖默认 space
- \`--config <path>\`：指定配置文件（默认 \`~/.cozerc.json\`）
- \`--log-file <path>\`：日志落文件

## 认证（coze auth）
\`\`\`bash
coze auth login --oauth       # 浏览器 OAuth 登录（推荐）
coze auth status              # 查看当前登录状态
coze auth logout              # 登出
\`\`\`
> 注：首次使用必须登录。API token 也可通过环境变量 \`COZE_API_TOKEN\` 注入。

## 上下文（organization / space）
\`\`\`bash
coze organization list        # 列出可访问组织（alias: coze org list）
coze organization use <orgId> # 切换默认组织；省略 id 切回个人账户
coze space list               # 列出当前组织的 space
coze space use <spaceId>      # 设默认 space（后续命令不必每次加 --space-id）
\`\`\`

## Coze Coding 项目（coze code project）
项目 = 一个 Vibe Project，类型包括 \`agent | workflow | app | skill | web | miniprogram | assistant\`。

\`\`\`bash
# 创建项目（核心能力：自然语言 → 自动生成项目结构）
coze code project create \\
  --message "<自然语言需求描述>" \\
  --type <agent|workflow|app|skill|web|miniprogram|assistant> \\
  [--wait]                    # 阻塞直到创建完成（长任务，可能需要几分钟）
  [--format json]             # 拿 projectId 用 json 输出 + jq 提取

# 查询
coze code project list        # 列出本 space 的所有项目
coze code project get <projectId>
coze code project delete <projectId>
\`\`\`

### ⚠️ 调用 create 的重要注意事项
- \`--wait\` 会阻塞很久（可能 >2 分钟），**非必要不要加**；不加 wait 会立刻返回 projectId，之后用 \`coze code message status -p <id>\` 轮询。
- \`--message\` 内容太长时，推荐用 heredoc 或 \`$(cat prompt.md)\` 读文件，避免 shell 引号地狱。
- 创建后用 \`--format json\` 解析 projectId，示例：\`coze code project create --message "..." --type web --format json | jq -r .data.projectId\`

## 与项目对话（coze code message）
创建项目后，用消息驱动 agent 迭代代码/内容。

\`\`\`bash
coze code message send "<消息内容>" -p <projectId>   # 发消息（或用 env COZE_PROJECT_ID）
coze code message status  -p <projectId>             # 查当前消息执行状态（完成后自动取结果）
coze code message cancel  -p <projectId>             # 取消正在执行的消息
coze code message history -p <projectId>             # 查看对话历史
\`\`\`

## 部署 / 预览 / 技能 / 环境变量 / 域名
\`\`\`bash
coze code deploy <projectId>   # 部署项目
coze code preview <projectId>  # 获取预览链接
coze code skill   <...>        # 技能管理（子命令较少用，需要时用 --help 查）
coze code env     <...>        # 环境变量 get/set/list/unset
coze code domain  <...>        # 自定义域名管理
\`\`\`

## 文件上传（coze file）
\`\`\`bash
coze file upload ./document.pdf   # 上传本地文件，获得 file_id，可作为消息附件
\`\`\`

## 媒体生成（coze generate）
\`\`\`bash
coze generate image "A cat"                     [--output-path ./out]
coze generate audio "Hello world"               [--output-path ./out]
coze generate video create "A dancing dog"      [--output-path ./out]
\`\`\`

## 本地配置（coze config）
\`\`\`bash
coze config list              # 查看全部配置
coze config get <key>
coze config set <key> <value> # 如 coze config set base_url https://api.coze.cn
coze config delete <key>
\`\`\`

## Agent 使用建议
1. **首次调用前** 跑 \`coze auth status\` 确认已登录；未登录时提示用户 \`coze auth login --oauth\`，不要自己尝试登录（需要浏览器交互）。
2. **不要盲目加 \`--wait\`**：阻塞几分钟容易被中止。先 fire-and-forget 拿 projectId，再 \`message status\` 轮询。
3. **尽量加 \`--format json\`** 方便解析，结果用 \`jq\` 提取字段。
4. **不确定具体子命令参数时**（本手册未覆盖），再去 \`coze <subcmd> --help\` 查，不要无脑 \`coze --help\`。
`;
