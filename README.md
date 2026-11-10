# sidebar-pro

DeepSeek Harness（DSH）插件合集，包含三个可直接安装的插件包：

| 包 | 版本 | 功能 |
| --- | --- | --- |
| `packages/sidebar-notes` | 1.3.1 | 侧栏便签：本地 Markdown 持久化、独立侧栏入口 |
| `packages/sidebar-todo` | 1.3.16 | 侧栏待办：任务/重复规则、项目问题记录（高亮/降序/单条删除）、月目标（编辑框随内容/视口自动增高）、周期视图（拖拽换日期）、随手记 |
| `packages/session-bridge` | 0.2.1 | 跨对话投递 `send_to_session`：工作区/对话目录在插件设置里配置 |

> 前两个包为 Host + Web 两半的 DSH 插件（`dsh.bundle.patch` + `dsh.client.platform=web`）；session-bridge 是纯 Host 插件（`dsh.bundle.patch`，无 client 半）。

## 安装（另一台电脑 / 另一个账号）

### 方式零：免 npm，直接装 tgz（推荐，最快）

两个包已打成 tarball 放在本仓库 `dist/`：

```powershell
dsh plugin add https://raw.githubusercontent.com/JackTomorrowit/sidebar-pro/main/dist/dsh-plugin-sidebar-notes.tgz
dsh plugin add https://raw.githubusercontent.com/JackTomorrowit/sidebar-pro/main/dist/dsh-plugin-sidebar-todo.tgz
```

若上面的命令不被识别，退化为：

```powershell
# 在 profile 目录（%USERPROFILE%\.dsh\profiles\<profile>）执行
npm install https://raw.githubusercontent.com/JackTomorrowit/sidebar-pro/main/dist/dsh-plugin-sidebar-todo.tgz
npm install https://raw.githubusercontent.com/JackTomorrowit/sidebar-pro/main/dist/dsh-plugin-sidebar-notes.tgz
# 再把 dsh-plugin-sidebar-notes / dsh-plugin-sidebar-todo 加进 package.json 的 dsh.profile.bundles，然后重启 DSH
```

### 方式一：npm（发布后最简单，市场式）

包发布到 npm 后，在目标机器的 DSH 中执行（或插件管理界面按包名安装）：

```powershell
dsh plugin add dsh-plugin-sidebar-notes
dsh plugin add dsh-plugin-sidebar-todo
```

或让 DSH 的插件管理器按包名安装，然后**重启 DSH**。

### 方式二：从 GitHub 手动安装

1. `git clone https://github.com/JackTomorrowit/sidebar-pro`
2. 把 `packages\sidebar-notes`、`packages\sidebar-todo` 复制到
   `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\` 下，
   目录名分别为 `dsh-plugin-sidebar-notes`、`dsh-plugin-sidebar-todo`
3. 在 profile 的 `package.json` 的 `dsh.profile.bundles` 中加入这两个包名
4. 重启 DSH 主进程，侧栏出现两个入口即成功

### 发布（维护者）

仓库带 GitHub Actions：在 npmjs.com 建好 granular token 后，加到仓库
Settings → Secrets and variables → Actions → `NPM_TOKEN`；
然后推一个 tag（如 `v1.3.15`）即自动发布两个包。

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
