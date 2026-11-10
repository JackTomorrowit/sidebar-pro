# sidebar-pro

DeepSeek Harness（DSH）侧栏插件合集，包含两个可直接安装的插件包：

| 包 | 版本 | 功能 |
| --- | --- | --- |
| `packages/sidebar-notes` | 1.3.0 | 侧栏便签：本地 Markdown 持久化、独立侧栏入口 |
| `packages/sidebar-todo` | 1.3.15 | 侧栏待办：任务/重复规则、项目问题记录（高亮/降序/单条删除）、月目标（编辑框随内容/视口自动增高）、周期视图（拖拽换日期）、随手记 |

> 两个包均为 Host + Web 两半的 DSH 插件：`dsh.bundle.patch` 负责注入加载项，`dsh.client.platform=web` 让 Web 端加载 `client.js`。

## 安装（同一台机器/另一个账号）

在目标机器的 DSH 配置目录下，二选一：

1. **从本仓库安装（推荐）**
   ```powershell
   cd <你的 DSH 工作区>
   # 以本地路径安装其中一个包（示例：待办）
   npm install --save "<仓库路径>\packages\sidebar-todo"
   # 然后在 DSH 的 profile package.json 的 dsh.profile.bundles 中加入包名：
   #   dsh-plugin-sidebar-todo
   #   dsh-plugin-sidebar-notes
   # 并重启 DSH 主进程
   ```

2. **手动拷贝**：把 `packages\sidebar-todo`（或 `sidebar-notes`）复制到目标 profile 的 `node_modules\` 下，
   并在 profile `package.json` 的 `dsh.profile.bundles` 里登记包名，重启 DSH。

> 说明：DSH 目前没有公开的"一键从 GitHub 安装插件"命令，最稳妥是上面两种方式。安装后侧栏会出现对应入口。

## 目录

```
sidebar-pro/
├─ package.json            # monorepo 根（workspaces）
├─ LICENSE                 # MIT
├─ packages/
│  ├─ sidebar-notes/       # 便签插件
│  └─ sidebar-todo/        # 待办插件
```

## 兼容性

- 目标 DSH 版本：`0.2.1-rc.5` 及以上（开发环境 0.2.2-rc.1 验证）。
- 无第三方运行时依赖；Node 由 DSH 自带。

## 许可证

MIT，见 [LICENSE](LICENSE)。
