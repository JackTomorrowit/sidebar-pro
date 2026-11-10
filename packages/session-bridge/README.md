# dsh-plugin-session-bridge

DSH 插件：让一个 Agent 向**同一工作区里的另一个对话**投递一条消息（跨对话通信），
提供 `send_to_session` 工具。

## 功能

- `send_to_session({ target, text, mode })`
  - `target`：对话文件夹名（如 `20261030-ht`）或 `sessionId`（`session-…`）
  - `mode`：`queue`（默认，等目标当前回合结束后处理）或 `steer`（立即插话）
  - 消息会自动加 `[来自 <标题> · conversations/<文件夹>]` 前缀
- 依赖宿主的 `sessionController.prompt`，不写任何会话文件

## 设置（重要）

安装后在 DSH 的插件设置里配置（留空使用默认值）：

| 字段 | 说明 |
| --- | --- |
| `workspaceRoot` | 要应用的工作区根目录，例如 `D:\dsh`（留空 = 当前进程工作目录） |
| `conversationsDir` | 对话根目录，例如 `D:\dsh\conversations`（留空 = `<workspaceRoot>/conversations`） |

插件按 `workspaceRoot`/`conversationsDir` 下的 `<对话名>/session.json` 找 sessionId；
找不到会在报错里列出尝试过的路径，提示去设置里配置。

## 安装

```powershell
dsh plugin add dsh-plugin-session-bridge
```

然后重启 DSH，并在插件设置里填工作区路径。

## 兼容性

- DSH `0.2.1-rc.5` 及以上（开发环境 0.2.2-rc.1 验证）
- 依赖宿主提供的 `@deepseek-ai/schemastery`（optional peer）

## 许可证

MIT
