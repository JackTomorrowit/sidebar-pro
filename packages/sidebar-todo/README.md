# 侧栏待办（`@local/sidebar-todo`）

把「我的工作台 → 待办事项」这套功能搬到 Harness Web UI 的左侧栏，入口位于「侧栏便签」上方。

- 侧栏入口 id：`sidebar-todo`，`order: 4`（侧栏便签是 `order: 5`，所以它在便签上面）。
- 主面板：`main` 槽位，`key: sidebar-todo`。点侧栏图标即在中央栏打开完整待办面板。

## 复刻了哪些功能

| 工作台原功能 | 侧栏版 |
| --- | --- |
| 周期视图：本周 + 下周 7 天日历清单 | 有 |
| 月度视图 | 有 |
| 单击日期标题 / 空白处 / 「单击添加待办」新增 | 有 |
| 分类：不分类 / 周期性工作 / 月目标 / 项目工作 / 临时性工作 / 随手记 | 有 |
| 重复规则：每天 / 每周 / 每月 / 自定义星期 | 有（含「至少选择一天」提示） |
| 单击待办切换完成状态（按日期记完成），双击编辑 | 有 |
| 编辑弹窗里删除待办及重复设置 | 有 |
| 象限视图：周工作（周期性 + 临时性合并，按完成排序） | 有 |
| 月目标分类：按月折叠、全部展开 / 收起 | 有 |
| 项目工作：项目资料、问题记录新增 / 编辑 / 折叠 / 搜索 / 全屏 | 有 |
| 随手记：按时间倒序、搜索 / 全屏 | 有 |
| **周工作颜色标记**：当天需完成标绿；带到本周 / 本周延期未完成标黄 | 增强 |
| **跨周复制**：上周未完成的周工作复制到本周一（原记录保留），复制件在周视图与周工作里标黄 | 增强 |

配色用主题 token `--dsw-alias-state-success-primary`（绿）/ `--dsw-alias-state-warn-primary`（黄），
明暗主题都可见。**周期视图只对「带到本周的复制件」标黄，当天任务不标绿**。
复制只处理**不重复**的周工作类任务（未分类 / 周期性 / 临时性）：已完成的、有重复规则的
（按规则重新生成）、月目标 / 项目 / 随手记都不动。原记录 `startDate` 保持不变，复制件带
`carriedFrom` / `carriedFromDate`，原记录用 `carriedTo` 记录已带出的周一，因此每条最多复制一次，
未完成的复制件下周可继续往后带（链式滚动，不会重复堆叠）。

数据结构与工作台 localStorage 文档 `ai-agent-web.todo.v1` 完全一致（`{ tasks, projects }`，
任务字段 `id / text / category / repeat / customDays / startDate / createdAt / month / done /
completedDates`），两边数据可以互导。

## 数据与同步

- **保存**：改动后 700ms 防抖，写一份浏览器 `localStorage`（`dsh.sidebar-todo.state.v1`）作为
  兜底，同时通过 Host 半写 `<home>/.dsh/sidebar-todo/state.json`（原子写）。
- **自动备份**：每天首次保存前，把上一版 `state.json` 复制成 `state.json.bak-YYYY-MM-DD`
  （保留最近 7 份，`BACKUP_KEEP`）。跨周顺延会改 `startDate`，这份备份用于回滚。
  Host 目录可用环境变量 `DSH_SIDEBAR_TODO_DIR` 覆盖。
- **同步工作台**（面板右上「同步工作台」）：Host 半只读扫描本机 Edge / Chrome / Brave / Vivaldi
  各配置档的 `Local Storage\leveldb`，找出 `ai-agent-web.todo.v1` 的 JSON 并按 `id` 合并导入。
  若浏览器正在运行并锁定文件，会提示「先关掉浏览器再同步」。
- **粘贴导入**（面板右上「粘贴导入」）：在工作台页面按 F12 → 控制台执行
  `copy(localStorage.getItem('ai-agent-web.todo.v1'))`，粘贴进来即可；支持合并 / 覆盖两种模式。
- **首次运行**：Host 的 `load` 会读数据目录里的 `workbench-todos.json` 作为种子快照
  （`<home>/.dsh/sidebar-todo/workbench-todos.json`，有内容时自动导入一次；插件目录只放代码）。

工作台工程本身**不写任何东西**：同步只读浏览器存储文件，插件自己的状态写在 `~/.dsh/sidebar-todo`。

> ⚠️ DSH 每次启动端口可能变化，而 `localStorage` 按 origin（含端口）隔离。本插件的**权威数据在 Host
> 数据目录** `state.json`，浏览器那份只是兜底副本：端口变化后副本会失效，打开面板时会从 Host 文档重建，
> 不影响数据。任何「把偏好存 localStorage」的做法在重启后都会丢——需要持久化的配置请写进插件默认值或
> Host 数据目录。

## Host API

`ctx.connection.fetch` 注册的精确路由（均为 `POST`）：

| 路由 | 用途 |
| --- | --- |
| `/api/sidebarTodo.load` | 返回 `{ version, directory, document, seed }`；`document` 首次为 `null`。 |
| `/api/sidebarTodo.save` | 收 `{ document }`，原子写入 `state.json`。 |
| `/api/sidebarTodo.sync` | 只读扫描浏览器存储并返回 `{ document, source, scanned, locked }`。 |

## Host 工具（供其它对话 / agent 调用）

Host 半通过 `ctx.tools.register()` 注册两个**全局**工具，任何会话的 agent 都能调用；读写的是同一份
`state.json`，与面板数据一致。

### `sidebar_todo_read`（只读，不触发保存）

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `scope` | `today` \| `week` \| `month` \| `projects` \| `notes` \| `all` | 默认 `today` |
| `date` | string | 基准日期 `yyyy-MM-dd`，默认今天 |
| `json` | boolean | `true` 返回 JSON（字段与面板一致），否则 Markdown 摘要 |

返回 `{ format, text, counts: { tasks, projects } }`；`today/week/month` 会额外列出「以前未完成」的遗留项。

### `sidebar_todo_merge`（合并写入）

参数 `ops: [...]`，按顺序执行，**任一 op 失败则整批不写入**；最多 50 个 op；不支持删除。

| op | 字段 | 说明 |
| --- | --- | --- |
| `add-task` | `text`（必填）、`category`、`repeat`、`customDays[]`、`startDate`、`month` | 新增待办；`startDate` 默认今天 |
| `add-note` | `text`（必填） | 新增随手记（category=note） |
| `add-project-problem` | `projectName`（必填，支持前缀匹配）、`text`（必填） | 给已有项目追加问题记录 |
| `set-done` | `id`（必填）、`done`（必填）、`date` | 勾选/取消某日完成（重复任务按 occurrence 记录） |
| `update-task` | `id`（必填）+ `text` / `category` / `repeat` / `customDays` / `startDate` / `month` | 局部更新（白名单字段） |
| `delete-task` | `id`（必填）、`text`（强烈建议，必须与记录一致） | **受控撤销**：仅允许删除 `category=note` 的随手记；id 未知、分类不是 note、text 不一致都会拒绝 |

参数 `dryRun: true`：只解析 + 校验并返回将产生的变更（`applied / counts / details`），**不写盘、不备份**。
试跑合并请务必先用它。

写入流程：Host 内读 → 校验 → **备份到 `~/.dsh/sidebar-todo/backups/state.json.bak-YYYY-MM-DD`**
（同日多次则追加 `-2`、`-3`，不覆盖旧备份）→ 原子写入。返回
`{ applied, counts, backupPath, dryRun, warning?, details }`。若面板在最近 30 分钟内加载或保存过，返回
`warning: "panel is open; its next save will auto-merge this change — ask the user to refresh to see it"`
（写入不会丢：面板下次保存会做三方合并，见下节）。

### 字段与判定口径（供其它对话使用）

| 字段 | 含义 |
| --- | --- |
| `text` | 内容；`category` 为 `''`（未分类）/ `periodic`（周期性）/ `temporary`（临时性）/ `monthly`（月目标）/ `project`（项目）/ `note`（随手记） |
| `startDate` | 首次出现日期 `yyyy-MM-dd`；**带到本周的复制件**的 `startDate` 是目标周一 |
| `repeat` | `''`（不重复）/ `daily`（每天）/ `weekly`（与 startDate 同星期）/ `monthly`（同日期）/ `custom`（按 `customDays`） |
| `customDays` | 中文星期名数组（`周一`…`周日`），仅 `repeat=custom` 使用 |
| `done` | 汇总标记；**逐日完成以 `completedDates` 为准**（`{ "yyyy-MM-dd": true }`，重复任务的每次 occurrence 各占一项） |
| `month` | 仅 `category=monthly` 使用，格式 `yyyy-MM` |
| `carriedFrom` / `carriedFromDate` | 复制件的来源任务 id / 原日期（用于标记黄色、追溯） |
| `carriedTo` | 原记录已被带到哪个周一（同一条最多带出一次） |
| `id` | 自动递增；`set-done` / `update-task` / `delete-task` 都用它定位 |

- **周/周期视图可见**：`category` 为 `''` / `periodic` / `temporary` 的任务；月目标走 `month`、项目走 `projects`、随手记走 `note`。
- **延期判定**：某日未完成且该日 < 今天 → 延期（面板黄色）；复制件即使日期是今天也按「带到本周」显示黄色。
- **工具读取不会触发跨周复制**；复制动作只发生在用户打开面板时。

### 并发与合并（竞态防护）

面板与 Host 工具可能同时写同一份文档。为避免「打开的面板用内存旧文档覆盖工具写入」：

1. `load` 返回内容版本 `rev`（tasks+projects 的 sha1 前 16 位），面板保存时回传 `baseRev`；
2. 保存时 Host 先比磁盘 `rev`：一致 → 直接写；不一致 → 与磁盘做**三方合并**（以最近一次 `load`
   的文档为基线，按 `id` 合并 tasks / projects / 项目问题记录）：
   - 磁盘新增（工具写入）→ 保留；面板新增 → 保留；面板删除且磁盘未改 → 生效；工具删除（仅限随手记）→ 生效；
   - 同一 id 双方都改 → 保留面板版本并回报 `conflicts`（不静默覆盖）；**字段级并集**：`completedDates`
     按日期取并集、`true` 优先，`done` 取逻辑或——面板改文本、工具改完成时两者都保得住；
     项目问题记录按 id 并集，不丢记录；
   - 没有可用基线时退化为**并集**（宁可不删，绝不丢数据）；
3. 返回 `{ document, rev, merged, conflicts, warning }`，面板采纳合并结果、更新 `baseRev` 并显示
   「已自动合并其他入口写入的新数据」提示；每次写入前仍会 `backups/` 留快照。

## 文件

```
package.json          bundle 清单：dsh.bundle.patch + dsh.client（platform web）
cordis.patch.yml      insert 一行 id 为 sidebar-todo 的插件
index.js              Host 半：state.json 持久化 + 三个 API 路由 + 工作台只读同步扫描
client.js             Client 半：侧栏图标、待办面板（周期视图 + 象限视图 + 弹窗）、locale
locale/en.json        Plugin Manager 里的标题/描述（英文）
locale/zh.json        Plugin Manager 里的标题/描述（中文）
icon.svg              原始清单图标
```

数据目录（`<home>/.dsh/sidebar-todo/`，可用 `DSH_SIDEBAR_TODO_DIR` 覆盖）里放
`state.json` 与可选的 `workbench-todos.json` 种子，**不放任何代码**。

## ⚠️ 修改本目录文件的唯一安全方式

本机装有亿赛通 DLP：**Node / PowerShell 等白名单进程写出的文件会被加密存盘**，
DSH（Electron）读到的是 `e0a8` 加密容器 —— 客户端模块 import 失败会导致 Web 启动致命错误
（2026-10-31 20:52 的「应用无法启动」即此原因）。因此：

- 改 `client.js` / `index.js` / `package.json` 等**必须用 DSH 的 read → edit/write 工具**，
  不要用脚本、编辑器或 `Copy-Item` 直接覆盖；
- 保存后用 `read` 复验能读出 JS/JSON 文本（而不是 “binary file”）；
- 插件目录里不存放运行时状态（由 Host 半写到上面说的数据目录）。

## 安装 / 更新 / 卸载

```powershell
# 首次安装
plugin_manager install_bundle  target: D:\ai-copywriter-web\dsh-plugin-todo

# 改完文件后更新：先移除再安装
plugin_manager remove_bundle   target: @local/sidebar-todo
plugin_manager install_bundle  target: D:\ai-copywriter-web\dsh-plugin-todo

# 卸载
plugin_manager remove_bundle   target: @local/sidebar-todo
```

安装 / 更新后刷新 Harness Web UI 页面；Host 半改动需要重启 Harness。
