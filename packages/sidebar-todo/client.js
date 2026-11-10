/**
 * Client half of the Sidebar Todo bundle.
 *
 * Registers two things against the live slot tree:
 *   - `sidebar.panellist`  the entry above Sidebar Notes in the left sidebar
 *                          (the shell owns the button, tooltip and active state);
 *   - `main`               the todo panel that entry id selects in the central column.
 *
 * The panel is a port of the workbench todo page (`frontend/src/components/todo/
 * TodoView.vue`): a period view (this week + next week calendar columns, month
 * calendar) and a category view (weekly work, monthly goals, projects with a problem
 * log, notes), with repeat rules and per-date completion. The document shape matches
 * the workbench localStorage document (`ai-agent-web.todo.v1`) so the same data can be
 * imported without changing the workbench.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-sidebar-todo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-sidebar-todo';
    /** Browser fallback copy of the document. */
    const STATE_KEY = 'dsh.sidebar-todo.state.v1';
    /** Sidebar entry id; the `main` cell key must be identical. */
    const PANEL_ID = 'sidebar-todo';
    /** Document-relative base of the Host API (see index.js). */
    const API_BASE = 'api/sidebarTodo';
    /** Bump CLIENT_BUILD whenever client.js changes, so the running page is identifiable. */
    const CLIENT_VERSION = '1.3.15';
    const CLIENT_BUILD = '2026-11-10T13:52';
    /** Debounce before a change is written to this browser and the Host. */
    const SAVE_DELAY = 700;

    const EN = {
      title: 'Sidebar Todo',
      label: 'Sidebar Todo',
      description: 'The workbench todo page, in the sidebar: period calendar, category lanes, repeat rules and completion ticks.',
      backToChat: 'Back to chat',
      sync: 'Sync workbench',
      syncing: 'Syncing…',
      import: 'Paste import',
      periodView: 'Period',
      categoryView: 'Categories',
      periodTitle: 'Period view · calendar list',
      periodHint: 'Click a day header, empty space or the add zone to create a todo',
      monthView: 'Month view',
      weekView: 'Week view',
      prev: 'Previous',
      next: 'Next',
      reset: 'Today',
      resetMonth: 'This month',
      addZone: 'Click to add a todo',
      periodNote: 'Unfinished todos stay on their date and also appear on the next day; set repeats in the editor.',
      categoryTitle: 'Category view',
      categoryHint: 'Periodic and temporary work merge into this week, grouped by category',
      weekNumber: 'Week ',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      fullscreen: 'Full screen',
      exitFullscreen: 'Exit full screen',
      searchNotes: 'Search notes',
      searchProjects: 'Search projects',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      remove: 'Delete',
      done: 'Done',
      restore: 'Restore',
      editTodo: 'Edit todo',
      taskMoved: 'Moved to {date}',
      taskMoveRolledBack: 'Move failed; the date was rolled back',
      editProject: 'Edit project',
      todoText: 'Todo text',
      projectName: 'Project name',
      director: 'Project director',
      group: 'Group',
      parentUnit: 'Parent unit',
      category: 'Category',
      repeat: 'Repeat',
      month: 'Month',
      noCategory: 'No category',
      repeatHelp: 'Daily repeats from the entry day; weekly on that weekday; monthly on that day; custom repeats weekly on the chosen weekdays.',
      empty: 'Nothing here yet.',
      monthlyGoalTitle: 'Monthly goals · daily performance log',
      monthlyGoalEmpty: 'No monthly goals yet; add one from the Monthly goals category with +.',
      problemLog: 'Problem log',
      addRecord: 'Add',
      deleteRecord: 'Delete',
      deleteRecordTitle: 'Delete this problem record?',
      deleteRecordHint: 'This cannot be undone. The Host backs up state.json first.',
      recordDeleted: 'Problem record deleted',
      recordDeleteFailed: 'Could not delete the problem record',
      recordPlaceholder: 'Add a record',
      saved: 'Saved',
      savingLabel: 'Saving…',
      hostError: 'Writing the local file failed; the changes stay in this browser for now.',
      mergedNotice: 'Newer data from another writer was merged automatically; refresh to see the latest.',
      mergedConflicts: 'conflicts:',
      storageBlocked: 'This browser blocked local storage; changes last only until the page closes.',
      syncOk: 'Imported workbench todos',
      syncNone: 'No workbench todo data found.',
      importTitle: 'Import workbench todos',
      importHint: 'Open the workbench page, press F12 → Console and run: copy(localStorage.getItem("ai-agent-web.todo.v1")), then paste it here.',
      importPlaceholder: '{"tasks":[…],"projects":[…]}',
      importMerge: 'Merge',
      importReplace: 'Replace',
      importOk: 'Import',
      importBad: 'That text is not a workbench todo document.',
      meetingEntry: 'Meeting notes',
      meetingTitle: 'Meeting notes · save transcript to inbox',
      meetingSubjectLabel: 'Meeting subject (required)',
      meetingDateLabel: 'Meeting date',
      meetingTranscriptLabel: 'Paste the meeting transcript here (no length limit, no format check)',
      meetingSave: 'Save to inbox',
      meetingSaving: 'Saving…',
      meetingSaveFailed: 'Could not save the meeting transcript',
      meetingSubjectRequired: 'Meeting subject is required',
      meetingTranscriptRequired: 'Transcript is required',
      meetingSaved: 'Saved: {path} (auto-processed at 18:00; ask the meeting specialist for immediate handling)',
      meetingDropHint: 'Drag or click to pick .md/.txt transcripts: one file fills the form, several are saved one by one (max 2MB each)',
      meetingUnsupported: 'unsupported format, convert it to .md/.txt first',
      meetingTooLarge: 'file is larger than 2MB',
      meetingReadFailed: 'could not read the file',
      meetingTooManyFiles: 'too many files in one batch (max {n})',
      meetingFolderUnsupported: 'folders are not supported',
      meetingTotalTooLarge: 'the batch is larger than {n}',
      meetingBatchSaved: 'Saved {n} meeting transcript(s)',
      meetingBatchFailed: 'Failed {m}',
      meetingNoSourceDate: 'no source date found; saving under today',
      maintenanceEntry: 'Maintenance: .bin → text',
      maintenanceTitle: 'Host copy: .bin/.txt → .md/.json/.txt/.log',
      maintenanceSrc: 'Source path (.bin/.txt under D:\\dsh)',
      maintenanceDest: 'Target path (.md/.json/.txt/.log/.bin under D:\\dsh)',
      maintenanceKeepHint: 'The source file is never modified, moved or deleted.',
      maintenanceSrcKept: 'Source kept: {path}',
      maintenanceDestDone: 'Target: {path}',
      maintenanceOverwrite: 'Overwrite if the target exists',
      maintenanceRun: 'Convert',
      maintenanceRunning: 'Converting…',
      maintenanceOk: 'Converted: {bytes} bytes, sha256={sha256}',
      maintenanceFailed: 'Convert failed',
      imported: 'Imported',
      catPeriodic: 'Periodic work',
      catMonthly: 'Monthly goals',
      catProject: 'Project work',
      catTemporary: 'Temporary work',
      catNote: 'Notes',
      catWeekly: 'This week',
      repNone: 'No repeat',
      repDaily: 'Daily',
      repWeekly: 'Weekly',
      repMonthly: 'Monthly',
      repCustom: 'Custom repeat',
      temporaryKind: 'Temporary work',
      customDaysRequired: 'Pick at least one weekday for a custom repeat.',
      todoSaved: 'Todo saved',
      todoUpdated: 'Todo updated',
      todoDeleted: 'Todo and its repeat rule deleted',
      completedTodo: 'Marked done',
      restoredTodo: 'Marked undone',
      categoryAdded: 'Added to ',
      itemUpdated: 'Updated',
      itemDeleted: 'Deleted',
      projectUpdated: 'Project updated',
      projectDeleted: 'Project deleted',
      recordUpdated: 'Record updated',
      recordAdded: 'Record added',
      hlApply: '🖍 Highlight',
      hlRemove: '✖ Remove highlight',
      hlClear: '🧹 Clear this record',
      hlClose: '✕',
      hlApplied: 'Highlight added',
      hlRemoved: 'Highlight removed',
      hlCleared: 'Highlights cleared',
      hlDropped: '{n} highlight(s) dropped because the text changed',
      rolledOver: 'Copied {n} unfinished items from last week to this Monday (originals kept)',
      weekLegend: 'Green = due today · Yellow = carried over to this week or overdue',
      noTask: 'Todo',
      monthUnit: 'Month',
      dayUnit: 'Day',
      thisWeekTitle: 'This week · ',
      nextWeekTitle: 'Next week · ',
      weekSuffixPre: '(week ',
      weekSuffixPost: ')',
    };

    const ZH = {
      title: '侧栏待办',
      label: '侧栏待办',
      description: '工作台待办事项的侧栏版：周期日历清单、象限视图、重复规则与完成打勾，数据可自动保存并从工作台同步。',
      backToChat: '回到对话',
      sync: '同步工作台',
      syncing: '同步中…',
      import: '粘贴导入',
      periodView: '周期视图',
      categoryView: '象限视图',
      periodTitle: '周期视图 · 日历清单',
      periodHint: '单击日期标题栏、日期空白区域或添加按钮即可新增',
      monthView: '月度视图',
      weekView: '返回周视图',
      prev: '上一周',
      next: '下一周',
      reset: '回到今天',
      resetMonth: '回到本月',
      addZone: '单击添加待办',
      periodNote: '未完成待办保留在原日期，并顺延显示在下一天；重复规则在待办编辑时设置。',
      categoryTitle: '象限视图',
      categoryHint: '周期性工作和临时性工作合并为本周周工作，按分类内容展示',
      weekNumber: '第',
      expandAll: '全部展开',
      collapseAll: '全部收起',
      fullscreen: '全屏展示',
      exitFullscreen: '退出全屏',
      searchNotes: '搜索随手记',
      searchProjects: '搜索项目',
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      remove: '删除',
      done: '完成',
      restore: '恢复',
      editTodo: '编辑待办',
      taskMoved: '已移动到 {date}',
      taskMoveRolledBack: '移动失败，已回滚日期',
      editProject: '编辑项目',
      todoText: '待办内容',
      projectName: '项目名称',
      director: '项目总监',
      group: '所属集团',
      parentUnit: '所属上级单位',
      category: '分类',
      repeat: '重复',
      month: '月份',
      noCategory: '不分类',
      repeatHelp: '每天从录入当天开始重复；每周在录入的星期几重复；每月按录入日期重复；自定义按每周重复并选择星期。',
      empty: '暂无内容',
      monthlyGoalTitle: '月目标 · 绩效目标每日记录',
      monthlyGoalEmpty: '暂无月目标，请在月目标分类中点击 ＋ 添加。',
      problemLog: '问题记录',
      addRecord: '添加',
      deleteRecord: '删除',
      deleteRecordTitle: '删除这条问题记录？',
      deleteRecordHint: '删除后不可恢复（Host 会先备份 state.json）。',
      recordDeleted: '已删除问题记录',
      recordDeleteFailed: '删除问题记录失败',
      recordPlaceholder: '输入问题记录',
      saved: '已保存',
      savingLabel: '保存中…',
      hostError: '本地文件写入失败，内容暂时只保存在浏览器里。',
      mergedNotice: '已自动合并其他入口写入的新数据，刷新面板后可看到最新内容',
      mergedConflicts: '冲突条目',
      storageBlocked: '浏览器拒绝了本地存储，内容只在关闭页面之前有效。',
      syncOk: '已导入工作台待办',
      syncNone: '没找到工作台待办数据。',
      importTitle: '导入工作台待办',
      importHint: '打开工作台页面按 F12 → 控制台执行：copy(localStorage.getItem("ai-agent-web.todo.v1"))，然后把内容粘贴到这里。',
      importPlaceholder: '{"tasks":[…],"projects":[…]}',
      importMerge: '合并导入',
      importReplace: '覆盖导入',
      importOk: '导入',
      importBad: '这段内容不是工作台的待办数据。',
      meetingEntry: '会议纪要',
      meetingTitle: '会议纪要 · 保存逐字稿到收件箱',
      meetingSubjectLabel: '会议主题（必填）',
      meetingDateLabel: '会议日期',
      meetingTranscriptLabel: '粘贴会议逐字稿（不限长度、不做格式校验）',
      meetingSave: '保存到收件箱',
      meetingSaving: '保存中…',
      meetingSaveFailed: '保存会议纪要失败',
      meetingSubjectRequired: '会议主题不能为空',
      meetingTranscriptRequired: '逐字稿不能为空',
      meetingSaved: '已保存：{path}（18:00 自动处理；如需立即处理请告知会议专员）',
      meetingDropHint: '拖入或点击选择 .md/.txt 逐字稿：单个文件填入表单，多个文件逐个保存（单个 ≤2MB）',
      meetingUnsupported: '格式不支持，请转成 .md/.txt',
      meetingTooLarge: '文件超过 2MB',
      meetingReadFailed: '读取失败',
      meetingTooManyFiles: '一次最多 {n} 个文件',
      meetingFolderUnsupported: '不支持文件夹',
      meetingTotalTooLarge: '所选文件总大小超过 {n}',
      meetingBatchSaved: '已保存 {n} 个会议纪要',
      meetingBatchFailed: '失败 {m} 个',
      meetingNoSourceDate: '未识别到源日期，按今天保存',
      maintenanceEntry: '维护：.bin → 文本',
      maintenanceTitle: '维护：把 .bin/.txt 转成 Host 可读文本',
      maintenanceSrc: '源路径（D:\\dsh 下的 .bin/.txt）',
      maintenanceDest: '目标路径（D:\\dsh 下的 .md/.json/.txt/.log 或 .bin）',
      maintenanceKeepHint: '转换不会修改、移动或删除源文件。',
      maintenanceSrcKept: '原文件已保留：{path}',
      maintenanceDestDone: '目标文件：{path}',
      maintenanceOverwrite: '目标已存在时覆盖',
      maintenanceRun: '转换',
      maintenanceRunning: '转换中…',
      maintenanceOk: '已转换：{bytes} 字节，sha256={sha256}',
      maintenanceFailed: '转换失败',
      imported: '已导入',
      catPeriodic: '周期性工作',
      catMonthly: '月目标',
      catProject: '项目工作',
      catTemporary: '临时性工作',
      catNote: '随手记',
      catWeekly: '周工作',
      repNone: '不重复',
      repDaily: '每天',
      repWeekly: '每周',
      repMonthly: '每月',
      repCustom: '自定义重复',
      temporaryKind: '临时性工作',
      customDaysRequired: '自定义重复至少选择一天',
      todoSaved: '已录入并保存',
      todoUpdated: '待办已更新',
      todoDeleted: '待办及重复设置已删除',
      completedTodo: '已完成该待办',
      restoredTodo: '已恢复未完成',
      categoryAdded: '已添加到',
      itemUpdated: '已更新内容',
      itemDeleted: '内容已删除',
      projectUpdated: '项目资料已更新',
      projectDeleted: '项目已删除',
      recordUpdated: '问题记录已更新',
      recordAdded: '已添加问题',
      hlApply: '🖍 高亮',
      hlRemove: '✖ 取消高亮',
      hlClear: '🧹 清除本条',
      hlClose: '✕',
      hlApplied: '已加高亮',
      hlRemoved: '已取消高亮',
      hlCleared: '已清除本条高亮',
      hlDropped: '有 {n} 处高亮因文字变化失效，已清理',
      rolledOver: '已将上周未完成的 {n} 项工作复制到本周一，原记录保留',
      weekLegend: '绿=今日需完成 · 黄=带到本周 / 本周延期',
      noTask: '待办',
      monthUnit: '月',
      dayUnit: '日',
      thisWeekTitle: '本周待办 · ',
      nextWeekTitle: '下一周待办 · ',
      weekSuffixPre: '（第',
      weekSuffixPost: '周）',
    };

    const CSS = [
      '.dsh-todo-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;height:100%;min-height:0;overflow:auto;',
      'padding:20px 24px 26px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit}',
      '.dsh-todo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.dsh-todo-heading{display:flex;align-items:flex-start;gap:12px;min-width:0}',
      '.dsh-todo-badge{display:flex;flex:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-title{margin:0;font-size:18px;font-weight:600;line-height:24px;letter-spacing:-.01em}',
      '.dsh-todo-desc{margin:4px 0 0;max-width:64ch;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsh-todo-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-btn{flex:none;font:inherit;font-size:13px;line-height:20px;padding:5px 12px;border-radius:8px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dsh-todo-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-todo-btn[disabled]{opacity:.6;cursor:default}',
      '.dsh-todo-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;',
      'padding:10px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-todo-toolbar strong{font-size:13px}',
      '.dsh-todo-segmented{display:flex;gap:3px;padding:3px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-segmented button{font:inherit;font-size:12px;line-height:18px;padding:5px 11px;border-radius:6px;cursor:pointer;',
      'border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-segmented button.active{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);',
      'color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-todo-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-todo-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;',
      'padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-section-head h2{margin:0 0 3px;font-size:15px}',
      '.dsh-todo-muted{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.dsh-todo-action{font:inherit;font-size:12px;line-height:18px;padding:5px 10px;border-radius:7px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dsh-todo-action:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-week{border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-week:last-child{border-bottom:0}',
      '.dsh-todo-week-title{padding:10px 16px 6px;font-size:13px;font-weight:700;color:var(--dsw-alias-label-secondary);',
      'background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-days{display:grid;grid-template-columns:repeat(7,minmax(102px,1fr));min-width:714px}',
      '.dsh-todo-day{border-right:1px solid var(--dsw-alias-border-l1);min-height:270px;cursor:pointer;display:flex;flex-direction:column}',
      '.dsh-todo-day:last-child{border-right:0}',
      '.dsh-todo-day--today{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dsh-todo-day-head{padding:9px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;',
      'color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-day--today .dsh-todo-day-head{color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-day-head b{display:block;font-size:17px;color:var(--dsw-alias-label-primary)}',
      '.dsh-todo-day--today .dsh-todo-day-head b{color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-task-list{flex:1 1 auto;padding:8px;display:flex;flex-direction:column;gap:7px;min-height:0}',
      '.dsh-todo-task{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-brand-primary);',
      'border-radius:7px;background:var(--dsw-alias-bg-base);padding:7px 8px;font-size:11px;line-height:1.45;cursor:pointer}',
      '.dsh-todo-task:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-task{cursor:grab}',
      '.dsh-todo-task--dragging{opacity:.45;cursor:grabbing}',
      '.dsh-todo-day--drop{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dsh-todo-task--done{opacity:.5;text-decoration:line-through}',
      '.dsh-todo-task--overdue{border-left-color:var(--dsw-alias-state-warn-primary);',
      'color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-todo-multiline{white-space:pre-line;overflow-wrap:anywhere;display:block}',
      '.dsh-todo-task-kind{display:block;margin-top:3px;font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-add-zone{margin:0 8px 8px;padding:9px;border:1px dashed var(--dsw-alias-border-l1);border-radius:7px;',
      'text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsh-todo-add-zone:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-editor{display:grid;gap:6px;padding:8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-field{box-sizing:border-box;width:100%;padding:6px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}',
      '.dsh-todo-field:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}',
      '.dsh-todo-field[data-autogrow]{resize:none;overflow-y:hidden}',
      '.dsh-todo-meeting-text{min-height:180px;resize:vertical}',
      '.dsh-todo-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;',
      'min-height:150px;box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:18px 12px;',
      'color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);cursor:pointer;text-align:center}',
      '.dsh-todo-dropzone:hover,.dsh-todo-dropzone--active{border-color:var(--dsw-alias-brand-primary);',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-dropzone-plus{display:block;font-size:30px;font-weight:600;line-height:1;color:inherit;pointer-events:none}',
      '.dsh-todo-maint{display:flex;justify-content:flex-end;margin-top:6px}',
      '.dsh-todo-record-delete{opacity:0;transition:opacity .12s ease}',
      '.dsh-todo-record:hover .dsh-todo-record-delete,.dsh-todo-record:focus-within .dsh-todo-record-delete{opacity:1}',
      '.dsh-todo-version{margin:6px 0 0;text-align:right;font-size:10px;line-height:14px;',
      'color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.dsh-todo-maint-link{background:none;border:none;padding:2px 4px;font-size:11px;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary);text-decoration:underline}',
      '.dsh-todo-maint-link:hover{color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-pre{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      '.dsh-todo-repeat-help{font-size:11px;line-height:1.45;padding:6px;border-radius:6px;',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-custom-days{display:flex;flex-wrap:wrap;gap:4px}',
      '.dsh-todo-custom-days label{display:flex;align-items:center;gap:3px;font-size:11px;padding:3px 5px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base)}',
      '.dsh-todo-custom-days input{width:auto;margin:0}',
      '.dsh-todo-editor-actions{display:flex;gap:6px}',
      '.dsh-todo-note{padding:10px 16px 14px;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-month{padding:0 12px 14px}',
      '.dsh-todo-month-title{padding:10px 4px;font-size:14px;font-weight:700;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-month-grid{display:grid;grid-template-columns:repeat(7,minmax(88px,1fr));min-width:640px;',
      'border-top:1px solid var(--dsw-alias-border-l1);border-left:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-month-grid>div{min-height:84px;padding:6px;border-right:1px solid var(--dsw-alias-border-l1);',
      'border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-month-weekday{min-height:0!important;text-align:center;font-size:11px;font-weight:700;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-month-cell--today{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dsh-todo-month-task{display:block;margin-top:5px;padding:3px 5px;border-left:2px solid var(--dsw-alias-brand-primary);',
      'border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-todo-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:16px}',
      '.dsh-todo-lane{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.dsh-todo-lane--fullscreen{position:fixed;inset:18px;z-index:30;overflow:auto;box-shadow:0 20px 60px #0006}',
      '.dsh-todo-lane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;',
      'padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-lane-heading{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 auto}',
      '.dsh-todo-lane-heading strong{font-size:13px}',
      '.dsh-todo-lane-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
      '.dsh-todo-lane-search{width:160px;max-width:100%;padding:5px 7px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px}',
      '.dsh-todo-mini{font:inherit;font-size:11px;line-height:16px;padding:3px 7px;border-radius:5px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-mini:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-todo-lane-items{display:flex;flex-direction:column;gap:6px;padding:10px}',
      '.dsh-todo-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);font-size:12px}',
      '.dsh-todo-item--done{opacity:.55;text-decoration:line-through}',
      '.dsh-todo-item--today{border-left:3px solid var(--dsw-alias-state-success-primary);',
      'color:var(--dsw-alias-state-success-primary)}',
      '.dsh-todo-item--overdue{border-left:3px solid var(--dsw-alias-state-warn-primary);',
      'color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-todo-item-main{display:flex;align-items:center;gap:5px;min-width:0}',
      '.dsh-todo-item-main--stacked{flex:1 1 auto;flex-direction:column;align-items:flex-start;gap:3px}',
      '.dsh-todo-item-main b{min-width:20px;color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-item-meta-box{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}',
      '.dsh-todo-item-meta{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-item-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
      '.dsh-todo-item-schedule{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-todo-inline-editor{display:flex;align-items:flex-start;gap:5px;width:100%}',
      '.dsh-todo-category-editor{display:grid;gap:6px;padding:8px;border:1px solid var(--dsw-alias-brand-primary);',
      'border-radius:8px;background:var(--dsw-alias-bg-layer-2);margin-bottom:6px}',
      '.dsh-todo-category-editor-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.dsh-todo-project{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.dsh-todo-project-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;',
      'background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-project-name{flex:1 1 auto;font-weight:700;overflow-wrap:anywhere;font-size:12px}',
      '.dsh-todo-project-meta{font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-left:6px}',
      '.dsh-todo-log{padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-log-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.dsh-todo-log-head h3{margin:0;font-size:12px}',
      '.dsh-todo-records{display:flex;flex-direction:column;gap:6px;margin-top:7px}',
      '.dsh-todo-record{padding:6px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'background:var(--dsw-alias-bg-layer-1);font-size:12px}',
      '.dsh-todo-record-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}',
      '.dsh-todo-record-meta small{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-hl{background:#ffd84a;color:#3b2c00;border-radius:2px;padding:0 1px}',
      '.dsh-todo-record-text{cursor:text;white-space:pre-line;overflow-wrap:anywhere}',
      '.dsh-todo-record-text::selection{background:#9bd0ff}',
      '.dsh-todo-record-editor{position:relative;width:100%}',
      '.dsh-todo-record-mirror{position:absolute;inset:0;box-sizing:border-box;padding:6px 7px;border:1px solid transparent;',
      'white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;pointer-events:none}',
      '.dsh-todo-record-mirror mark.dsh-todo-hl{color:#3b2c00}',
      '.dsh-todo-record-editor textarea{position:relative;z-index:1;background:transparent!important;color:transparent!important;',
      '-webkit-text-fill-color:transparent;caret-color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}',
      '.dsh-todo-record-editor textarea::selection{background:rgba(31,111,235,.32);color:transparent}',
      '.dsh-todo-record-editor--composing .dsh-todo-record-mirror{visibility:hidden}',
      '.dsh-todo-record-editor--composing textarea{color:var(--dsw-alias-label-primary)!important;-webkit-text-fill-color:currentColor}',
      '.dsh-todo-hlbar{position:fixed;z-index:60;display:flex;gap:4px;padding:4px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:8px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px #00000033}',
      '.dsh-todo-hlbar button{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:12px;line-height:18px;padding:3px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.dsh-todo-hlbar button:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-hlbar button[disabled]{opacity:.45;cursor:default}',
      '.dsh-todo-hlbar button[disabled]:hover{background:transparent}',
      '.dsh-todo-monthly-goal{grid-column:1/-1;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}',
      '.dsh-todo-monthly-goal h2{margin:0 0 8px;font-size:14px}',
      '.dsh-todo-empty{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-modal-backdrop{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;',
      'padding:20px;background:#0000002e}',
      '.dsh-todo-modal{width:min(440px,100%);max-height:86vh;overflow:auto;display:grid;gap:8px;padding:16px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);',
      'box-shadow:0 18px 50px #00000040}',
      '.dsh-todo-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.dsh-todo-modal-head h3{margin:0;font-size:15px}',
      '.dsh-todo-modal-close{width:26px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer}',
      '.dsh-todo-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:transparent}',
      '.dsh-todo-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);',
      'color:var(--dsw-alias-bg-base,#fff);font-weight:600}',
      '.dsh-todo-primary:hover{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base,#fff);filter:brightness(1.06)}',
      '.dsh-todo-primary:active{filter:brightness(.94)}',
      '.dsh-todo-danger:hover{background:transparent;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-todo-toast{position:fixed;right:22px;bottom:22px;z-index:50;padding:9px 14px;border-radius:8px;font-size:12px;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-todo-warn{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary)}',
      '@media (max-width:1000px){.dsh-todo-categories{grid-template-columns:1fr}}',
    ].join('');

    // -----------------------------------------------------------------------
    // Date helpers (ported from the workbench component)
    // -----------------------------------------------------------------------

    const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    function startOfWeek(value) {
      const date = new Date(value);
      const day = date.getDay() || 7;
      date.setDate(date.getDate() - day + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    function addDays(value, amount) {
      const date = new Date(value);
      date.setDate(date.getDate() + amount);
      return date;
    }

    function keyOf(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function dateText(date) {
      return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日';
    }

    function weekNumber(date) {
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const day = target.getDay() || 7;
      target.setDate(target.getDate() + 4 - day);
      const yearStart = new Date(target.getFullYear(), 0, 1);
      return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    }

    function timeText(date) {
      return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }

    function parseDateKey(value) {
      const parts = String(value || '').split('-').map(Number);
      return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    }

    function monthKeyOf(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    }

    function weekdayForDate(date) {
      return WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
    }

    function todayValue() {
      const value = new Date();
      value.setHours(0, 0, 0, 0);
      return value;
    }

    // -----------------------------------------------------------------------
    // Document normalization: same shape as the workbench document
    // -----------------------------------------------------------------------

    function normalizeTask(raw, nextId) {
      const completed = raw.completedDates && typeof raw.completedDates === 'object' ? Object.assign({}, raw.completedDates) : {};
      return {
        id: Number(raw.id) || nextId(),
        text: String(raw.text || ''),
        category: String(raw.category || ''),
        repeat: String(raw.repeat || ''),
        customDays: Array.isArray(raw.customDays) ? raw.customDays.map(String) : [],
        startDate: String(raw.startDate || keyOf(todayValue())),
        createdAt: String(raw.createdAt || raw.startDate || ''),
        month: String(raw.month || ''),
        done: Boolean(raw.done),
        completedDates: completed,
        carriedTo: raw.carriedTo ? String(raw.carriedTo) : '',
        carriedFrom: raw.carriedFrom === null || raw.carriedFrom === undefined || raw.carriedFrom === '' ? null : Number(raw.carriedFrom),
        carriedFromDate: raw.carriedFromDate ? String(raw.carriedFromDate) : '',
      };
    }

    // --- problem-record text highlights: [start, end) offsets over the plain text ---

    function sortHighlights(list) {
      return list.slice().sort((left, right) => left.start - right.start || left.end - right.end);
    }

    /** Clamp runs to whole character offsets and merge overlaps, without a text bound. */
    function clampHighlights(list) {
      const runs = [];
      for (const item of list || []) {
        if (!item || typeof item !== 'object') continue;
        const start = Number(item.start);
        const end = Number(item.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        const from = Math.max(0, Math.floor(start));
        const to = Math.floor(end);
        if (to <= from) continue;
        runs.push({ start: from, end: to, color: 'yellow' });
      }
      const merged = [];
      for (const item of sortHighlights(runs)) {
        const last = merged[merged.length - 1];
        if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
        else merged.push({ start: item.start, end: item.end, color: 'yellow' });
      }
      return merged;
    }

    /** Clamp stored runs into the text and merge overlapping/adjacent runs. */
    function normalizeHighlights(raw, text) {
      const limit = String(text || '').length;
      const runs = [];
      if (!Array.isArray(raw)) return runs;
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const start = Number(item.start);
        const end = Number(item.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        const from = Math.max(0, Math.min(limit, Math.floor(start)));
        const to = Math.max(0, Math.min(limit, Math.floor(end)));
        if (to <= from) continue;
        runs.push({ start: from, end: to, color: 'yellow' });
      }
      const merged = [];
      for (const item of sortHighlights(runs)) {
        const last = merged[merged.length - 1];
        if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
        else merged.push({ start: item.start, end: item.end, color: 'yellow' });
      }
      return merged;
    }

    function hasOverlapHighlight(list, start, end) {
      for (const item of list || []) {
        if (item.end > start && item.start < end) return true;
      }
      return false;
    }

    /** Add one range and union it with overlapping or adjacent runs. */
    function addHighlightRange(list, start, end) {
      const merged = [];
      for (const item of sortHighlights(clampHighlights(list).concat([{ start, end, color: 'yellow' }]))) {
        const last = merged[merged.length - 1];
        if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
        else merged.push({ start: item.start, end: item.end, color: 'yellow' });
      }
      return merged;
    }

    /** Remove one range from the runs, splitting a run that only partially overlaps. */
    function subtractHighlightRange(list, start, end) {
      const out = [];
      for (const item of clampHighlights(list)) {
        if (item.end <= start || item.start >= end) {
          out.push(item);
          continue;
        }
        if (item.start < start) out.push({ start: item.start, end: start, color: 'yellow' });
        if (item.end > end) out.push({ start: end, end: item.end, color: 'yellow' });
      }
      return sortHighlights(out);
    }

    /**
     * Shift highlight offsets after an edit: the replaced span is derived from the
     * common prefix/suffix. Runs before it stay, runs after it move by the delta, runs
     * intersecting it are dropped (the caller reports how many became invalid).
     */
    function adjustHighlights(previousText, nextText, list) {
      const before = String(previousText || '');
      const after = String(nextText || '');
      const limit = Math.min(before.length, after.length);
      let prefix = 0;
      while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
      let suffix = 0;
      while (suffix < limit - prefix && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)) suffix += 1;
      const removedStart = prefix;
      const removedEnd = before.length - suffix;
      const delta = after.length - suffix - removedEnd;
      const out = [];
      for (const item of normalizeHighlights(list, before)) {
        if (item.end <= removedStart) out.push(item);
        else if (item.start >= removedEnd) out.push({ start: item.start + delta, end: item.end + delta, color: 'yellow' });
      }
      return out.filter((item) => item.end > item.start && item.start >= 0 && item.end <= after.length);
    }

    /** Split record text into plain text nodes and yellow <mark> runs. */
    function renderHighlightedText(text, highlights) {
      const value = String(text || '');
      const runs = normalizeHighlights(highlights, value);
      const nodes = [];
      let cursor = 0;
      let key = 0;
      for (const item of runs) {
        if (item.start > cursor) nodes.push(h('span', { key: 'hl-t' + key++ }, value.slice(cursor, item.start)));
        nodes.push(h('mark', { key: 'hl-m' + key++, className: 'dsh-todo-hl' }, value.slice(item.start, item.end)));
        cursor = item.end;
      }
      if (cursor < value.length) nodes.push(h('span', { key: 'hl-t' + key++ }, value.slice(cursor)));
      return nodes;
    }

    /** Drop the text selection after a highlight action, matching the view-mode result. */
    function collapseRecordSelection() {
      try {
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
          const element = document.querySelector('.dsh-todo-record-input');
          if (element && typeof element.setSelectionRange === 'function') {
            const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : 0;
            element.setSelectionRange(end, end);
          }
        }
      } catch (error) {
        /* cosmetic only */
      }
      try {
        if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
          const selection = window.getSelection();
          if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
        }
      } catch (error) {
        /* cosmetic only */
      }
    }

    /** Problem records are always shown newest-first (id desc, createdAt tie-breaker). */
    function sortProblemRecordsNewestFirst(list) {
      return list.slice().sort((left, right) => {
        const byId = (Number(right.id) || 0) - (Number(left.id) || 0);
        if (byId !== 0) return byId;
        return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
      });
    }

    function normalizeProject(raw) {
      const records = Array.isArray(raw.records && raw.records.problem)
        ? raw.records.problem.map((record, index) => {
            const text = String((record && record.text) || '');
            return {
              id: Number(record && record.id) || index + 1,
              createdAt: String((record && record.createdAt) || ''),
              text,
              highlights: normalizeHighlights(record && record.highlights, text),
            };
          })
        : [];
      return {
        id: Number(raw.id) || 0,
        name: String(raw.name || ''),
        director: String(raw.director || ''),
        group: String(raw.group || ''),
        parentUnit: String(raw.parentUnit || ''),
        done: Boolean(raw.done),
        addingProblem: false,
        collapsed: { problem: Boolean(raw.collapsed && raw.collapsed.problem) },
        draft: { problem: '' },
        records: { problem: sortProblemRecordsNewestFirst(records) },
      };
    }

    /** Accept the workbench document and return a clean copy, or null. */
    function normalizeDocument(raw) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
      let counter = 1;
      const nextId = () => 9000 + counter++;
      const tasks = raw.tasks.filter((item) => item && typeof item === 'object').map((item) => normalizeTask(item, nextId));
      const projects = Array.isArray(raw.projects)
        ? raw.projects.filter((item) => item && typeof item === 'object').map((item) => normalizeProject(item))
        : [];
      let idCounter = 1;
      for (const project of projects) {
        if (!project.id) project.id = 100 + idCounter++;
        for (const record of project.records.problem) {
          if (!record.id) record.id = 1;
        }
      }
      return { tasks, projects, importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : '' };
    }

    function readLocalDocument() {
      try {
        const raw = window.localStorage.getItem(STATE_KEY);
        if (!raw) return null;
        return normalizeDocument(JSON.parse(raw));
      } catch (error) {
        return null;
      }
    }

    function writeLocalDocument(document) {
      try {
        window.localStorage.setItem(STATE_KEY, JSON.stringify(document));
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Call one Host operation; resolves the parsed JSON or throws. */
    async function callApi(operation, payload) {
      const url = new URL(API_BASE + '.' + operation, document.baseURI);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data && data.error;
        const message = typeof detail === 'string' ? detail : detail && detail.message ? detail.message : 'HTTP ' + response.status;
        const error = new Error(message);
        error.code = detail && typeof detail === 'object' && detail.code ? detail.code : '';
        error.detail = data;
        throw error;
      }
      return data;
    }

    // -----------------------------------------------------------------------
    // Model: the workbench component's state and logic, ported 1:1
    // -----------------------------------------------------------------------

    /**
     * Split a leading source date stamp off a file name or subject. Accepts
     * `yyyyMMdd` and `yyyyMMddHHmmss`, optionally preceded by `-`/`_`/space.
     */
    function meetingSplitSourceDate(text) {
      const value = String(text || '');
      const match = /^\s*[-_ ]*(\d{8}(?:\d{6})?)(?=[-_ .]|$)/.exec(value);
      if (!match) return { date: '', subject: value.trim() };
      const digits = match[1];
      const year = Number(digits.slice(0, 4));
      const month = Number(digits.slice(4, 6));
      const day = Number(digits.slice(6, 8));
      if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) {
        return { date: '', subject: value.trim() };
      }
      const rest = value.slice(match[0].length).replace(/^[-_ .]+/, '').trim();
      return { date: digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8), subject: rest };
    }

    /** Remove trailing "逐字稿/文本/-1"-style tokens from a subject. */
    function meetingCleanSubjectTail(subject) {
      let stem = String(subject || '').trim();
      let previous = '';
      while (previous !== stem) {
        previous = stem;
        stem = stem.replace(/[-_ ](?:逐字稿文本|逐字稿|文本|transcript|\d+)$/i, '').trim();
        stem = stem.replace(/[-_ ]+$/g, '');
      }
      return stem.trim();
    }

    /** Parse one dropped file: leading source date (if any) + readable subject. */
    function meetingFileInfo(fileName) {
      const stem = String(fileName || '').replace(/\.[^.]+$/, '').trim();
      const split = meetingSplitSourceDate(stem);
      const subject = meetingCleanSubjectTail(split.subject);
      return { date: split.date, subject: subject || '会议' };
    }

    /** Upload guardrails: one drop/pick is capped; saves run one at a time. */
    const MEETING_MAX_FILES = 10;
    const MEETING_MAX_FILE_BYTES = 2 * 1024 * 1024;
    const MEETING_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
    const MEETING_SAVE_GAP_MS = 150;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /** Drag-and-drop represents a folder as a zero-byte, extension-less entry. */
    function isLikelyFolder(file) {
      const fileName = String(file && file.name ? file.name : '');
      if (!fileName) return true;
      if (/[\\/]$/.test(fileName)) return true;
      const hasDot = fileName.indexOf('.') >= 0;
      const emptyBinary = Number((file && file.size) || 0) === 0 && !(file && file.type);
      return !hasDot && emptyBinary;
    }

    /** Best-effort crash report to the host log; never throws. */
    function reportClientError(detail, context) {
      try {
        const message = detail && detail.message ? String(detail.message) : String(detail || '');
        const stack = detail && detail.stack ? String(detail.stack) : '';
        const payload = {
          level: 'error',
          context: String(context || ''),
          message: message.slice(0, 2000),
          stack: stack.slice(0, 2000),
          at: new Date().toISOString(),
        };
        if (typeof fetch !== 'function' || typeof document === 'undefined') return;
        const url = new URL(API_BASE + '.appendLog', document.baseURI);
        const request = fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (request && typeof request.catch === 'function') request.catch(() => {});
      } catch (error) {
        /* reporting must never break the panel */
      }
    }

    /** Lightweight step trace (same appendLog route, level=info) for diagnosing saves. */
    function reportClientTrace(context, message) {
      try {
        if (typeof fetch !== 'function' || typeof document === 'undefined') return;
        const url = new URL(API_BASE + '.appendLog', document.baseURI);
        const request = fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            level: 'info',
            context: String(context || 'trace'),
            message: (CLIENT_VERSION + ' ' + String(message || '')).slice(0, 2000),
            at: new Date().toISOString(),
          }),
        });
        if (request && typeof request.catch === 'function') request.catch(() => {});
      } catch (error) {
        /* tracing must never break the panel */
      }
    }

    /** Register global error hooks once so an unexpected crash leaves a trace on disk. */
    function installCrashReporters() {
      try {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        if (window.__sidebarTodoCrashHooks) return;
        window.__sidebarTodoCrashHooks = true;
        window.addEventListener('error', (event) => {
          reportClientError((event && (event.error || event.message)) || 'unknown error', 'window.error');
        });
        window.addEventListener('unhandledrejection', (event) => {
          reportClientError((event && event.reason) || 'unknown rejection', 'unhandledrejection');
        });
      } catch (error) {
        /* hooks are best effort */
      }
    }

    function createModel(tr) {
      const model = {
        tasks: [],
        projects: [],
        loaded: false,
        mainView: 'period',
        showMonth: false,
        weekOffset: 0,
        monthOffset: 0,
        editorDay: '',
        draft: { text: '', category: '', repeat: '', month: '', customDays: [] },
        editingTask: null,
        taskEditDraft: { text: '', category: '', repeat: '', month: '', customDays: [] },
        categoryEditorKey: '',
        categoryText: '',
        categoryDraft: { repeat: '', month: '', weeklyType: 'periodic', director: '', group: '', parentUnit: '', customDays: [] },
        editingItemKey: '',
        editingText: '',
        noteSearch: '',
        projectSearch: '',
        monthlyCollapsed: {},
        dragKey: '',
        dragOverKey: '',
        rollbackMove: null,
        fullscreenCategory: '',
        editingRecord: null,
        editingRecordText: '',
        editingRecordHighlights: [],
        editingRecordDropped: 0,
        recordDeleteTarget: null,
        recordDeleting: false,
        highlightBar: null,
        editingProject: null,
        projectEditDraft: { name: '', director: '', group: '', parentUnit: '' },
        importOpen: false,
        importText: '',
        importMode: 'merge',
        importNotice: '',
        meetingOpen: false,
        meetingSubject: '',
        meetingDate: '',
        meetingTranscript: '',
        meetingError: '',
        meetingNotice: '',
        meetingSaving: false,
        meetingDragging: false,
        meetingDropNotice: '',
        maintenanceOpen: false,
        maintenanceSrc: '',
        maintenanceDest: '',
        maintenanceOverwrite: false,
        maintenanceResult: '',
        maintenanceError: '',
        maintenanceBusy: false,
        toast: '',
        hostVersion: '',
        saving: false,
        hostError: false,
        storageBlocked: false,
        syncing: false,
        baseRev: '',
        mergeNotice: '',
        nextTaskId: 1,
        nextProjectId: 1,
        nextRecordId: 1,
        bump: () => {},
      };

      let toastTimer = 0;
      let persistTimer = 0;

      const today = todayValue;
      const monday = () => startOfWeek(today());

      model.showToast = (message) => {
        model.toast = message;
        model.bump();
        if (toastTimer) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          model.toast = '';
          model.bump();
        }, 1800);
      };

      // ----- persistence ---------------------------------------------------
      const documentOf = () => ({ version: 1, tasks: model.tasks, projects: model.projects, importedAt: model.importedAt || '', updatedAt: new Date().toISOString() });

      model.recount = () => {
        let maxTask = 0;
        for (const task of model.tasks) maxTask = Math.max(maxTask, Number(task.id) || 0);
        model.nextTaskId = maxTask + 1;
        let maxProject = 0;
        let maxRecord = 0;
        for (const project of model.projects) {
          maxProject = Math.max(maxProject, Number(project.id) || 0);
          for (const record of project.records.problem) maxRecord = Math.max(maxRecord, Number(record.id) || 0);
        }
        model.nextProjectId = maxProject + 1;
        model.nextRecordId = maxRecord + 1;
      };

      model.persist = () => {
        const snapshot = documentOf();
        model.storageBlocked = !writeLocalDocument(snapshot);
        model.saving = true;
        model.bump();
        callApi('save', { document: snapshot, baseRev: model.baseRev })
          .then((data) => {
            model.hostError = false;
            model.saving = false;
            model.rollbackMove = null;
            if (data && typeof data.rev === 'string') model.baseRev = data.rev;
            if (data && typeof data.version === 'string') model.hostVersion = data.version;
            if (data && data.merged) {
              const conflicts = Array.isArray(data.conflicts) ? data.conflicts : [];
              model.mergeNotice = tr('mergedNotice') + (conflicts.length > 0 ? ' · ' + tr('mergedConflicts') + ' ' + conflicts.length : '');
              const normalized = data.document ? normalizeDocument(data.document) : null;
              if (normalized) model.adopt(normalized);
              model.showToast(model.mergeNotice);
            }
            model.bump();
          })
          .catch(() => {
            model.hostError = true;
            model.saving = false;
            if (model.rollbackMove) {
              const rollback = model.rollbackMove;
              model.rollbackMove = null;
              const moved = model.tasks.find((task) => Number(task.id) === Number(rollback.taskId));
              if (moved) Object.assign(moved, rollback.before);
              model.showToast(tr('taskMoveRolledBack'));
            }
            model.bump();
          });
      };

      model.schedulePersist = () => {
        if (persistTimer) window.clearTimeout(persistTimer);
        persistTimer = window.setTimeout(() => {
          persistTimer = 0;
          model.persist();
        }, SAVE_DELAY);
      };

      model.flush = () => {
        if (persistTimer) {
          window.clearTimeout(persistTimer);
          persistTimer = 0;
          model.persist();
        }
      };

      model.adopt = (document) => {
        model.tasks = document.tasks;
        model.projects = document.projects;
        model.importedAt = document.importedAt || '';
        model.recount();
        model.bump();
      };

      model.importDocument = (raw, mode) => {
        const normalized = normalizeDocument(raw);
        if (!normalized) return false;
        if (mode === 'replace') {
          model.tasks = normalized.tasks;
          model.projects = normalized.projects;
        } else {
          const taskIds = new Set(model.tasks.map((task) => Number(task.id)));
          for (const task of normalized.tasks) {
            if (taskIds.has(Number(task.id))) continue;
            model.tasks.push(task);
            taskIds.add(Number(task.id));
          }
          const projectIds = new Set(model.projects.map((project) => Number(project.id)));
          for (const project of normalized.projects) {
            if (projectIds.has(Number(project.id))) continue;
            model.projects.push(project);
            projectIds.add(Number(project.id));
          }
        }
        model.importedAt = new Date().toISOString();
        model.recount();
        model.schedulePersist();
        model.bump();
        return true;
      };

      // ----- boot ----------------------------------------------------------
      model.bootstrap = () => {
        const local = readLocalDocument();
        if (local) model.adopt(local);
        callApi('load', {})
          .then((data) => {
            const remote = data && data.document ? normalizeDocument(data.document) : null;
            const seed = data && data.seed ? normalizeDocument(data.seed) : null;
            if (data && typeof data.rev === 'string') model.baseRev = data.rev;
            if (data && typeof data.version === 'string') model.hostVersion = data.version;
            if (remote) {
              model.adopt(remote);
              writeLocalDocument(documentOf());
            } else if (seed) {
              model.tasks = seed.tasks;
              model.projects = seed.projects;
              model.importedAt = new Date().toISOString();
              model.recount();
              model.bump();
              model.schedulePersist();
            } else if (local) {
              model.schedulePersist();
            }
            model.applyCarryOver();
            model.loaded = true;
            model.bump();
          })
          .catch(() => {
            model.hostError = true;
            model.applyCarryOver();
            model.loaded = true;
            model.bump();
          });
      };

      model.dispose = () => {
        if (toastTimer) window.clearTimeout(toastTimer);
        model.flush();
      };

      model.syncWorkbench = () => {
        if (model.syncing) return;
        model.syncing = true;
        model.bump();
        callApi('sync', {})
          .then((data) => {
            model.syncing = false;
            if (data && data.document && model.importDocument(data.document, 'merge')) {
              model.showToast(tr('syncOk') + ' · ' + model.tasks.length);
            } else {
              model.showToast(tr('syncNone'));
            }
            model.bump();
          })
          .catch((error) => {
            model.syncing = false;
            model.importNotice = error && error.message ? error.message : tr('syncNone');
            model.importOpen = true;
            model.bump();
          });
      };

      // ----- queries -------------------------------------------------------
      model.taskSource = (item) => item.source || item;

      model.isTaskOnDate = (task, date) => {
        const start = parseDateKey(task.startDate);
        const current = new Date(date);
        if (current < start) return false;
        if (!task.repeat) return keyOf(current) === task.startDate;
        if (task.repeat === 'daily') return true;
        if (task.repeat === 'weekly') return current.getDay() === start.getDay();
        if (task.repeat === 'monthly') return current.getDate() === start.getDate();
        if (task.repeat === 'custom') {
          const weekday = WEEKDAYS[current.getDay() === 0 ? 6 : current.getDay() - 1];
          return task.customDays.indexOf(weekday) >= 0;
        }
        return false;
      };

      model.isVisibleInPeriod = (task) => ['monthly', 'project', 'note'].indexOf(task.category) < 0;

      model.taskViews = () => {
        const dates = model.showMonth ? model.monthCells().filter(Boolean) : model.weekRows().flatMap((row) => row.days.map((day) => day.date));
        const views = new Map();
        for (const date of dates) {
          const dateKey = keyOf(date);
          const list = [];
          for (const task of model.tasks) {
            if (!model.isVisibleInPeriod(task) || !model.isTaskOnDate(task, date)) continue;
            list.push(Object.assign({}, task, {
              id: task.id + '-' + dateKey,
              number: list.length + 1,
              occurrenceKey: dateKey,
              weekday: WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1],
              source: task,
            }));
          }
          views.set(dateKey, list);
        }
        return views;
      };

      model.tasksFor = (date) => model.taskViews().get(keyOf(date)) || [];

      model.isTaskDone = (task) => Boolean(task.source && task.source.completedDates && task.source.completedDates[task.occurrenceKey]);

      model.isToday = (date) => keyOf(date) === keyOf(today());

      /**
       * Visual tone of one weekly-work item: '' | 'today' (green) | 'overdue' (yellow).
       * A copy carried over from an earlier week is always shown as carried (yellow),
       * even when its date is today, because it is last week's unfinished work.
       */
      model.itemTone = (item, done) => {
        if (done) return '';
        if (item.carriedFrom !== null && item.carriedFrom !== undefined && item.carriedFrom !== '') return 'overdue';
        const todayKey = keyOf(today());
        const scheduled = String(item.occurrenceKey || item.startDate || '');
        if (!scheduled) return '';
        if (scheduled === todayKey) return 'today';
        if (scheduled < todayKey) return 'overdue';
        return '';
      };

      /**
       * One-time repair: the previous version moved six unfinished items onto this
       * Monday and lost their original date. Recognise them by their `createdAt`
       * (unique per record, unlike auto-increment ids which can be reused after a
       * delete) and restore the original date; copies are skipped outright.
       */
      const MOVED_ORIGINALS = {
        '2026-10-21T12:36:26.720Z': '2026-10-21',
        '2026-10-21T12:36:49.369Z': '2026-10-21',
        '2026-10-22T06:45:55.842Z': '2026-10-22',
        '2026-10-29T12:54:26.727Z': '2026-10-29',
        '2026-11-01T15:07:57.781Z': '2026-11-01',
        '2026-11-01T15:08:57.067Z': '2026-11-01',
      };

      model.restoreMovedTasks = () => {
        const mondayKey = keyOf(monday());
        let restored = 0;
        for (const task of model.tasks) {
          if (String(task.startDate || '') !== mondayKey) continue;
          if (task.carriedFrom !== null && task.carriedFrom !== undefined && task.carriedFrom !== '') continue;
          const original = MOVED_ORIGINALS[String(task.createdAt || '')];
          if (!original) continue;
          task.startDate = original;
          task.carriedTo = '';
          restored += 1;
        }
        return restored;
      };

      /**
       * Copy last week's unfinished work onto this Monday and keep the original. Only
       * non-repeating weekly work is copied: repeating tasks regenerate from their own
       * rule, and monthly / project / note entries keep their dates as metadata.
       * `carriedTo` marks a task that has already spawned its copy, so each record is
       * carried at most once; a copy that is left unfinished again can be carried the
       * following week, which keeps the chain going without piling up duplicates.
       */
      model.carryOverUnfinishedToMonday = () => {
        const mondayKey = keyOf(monday());
        const sources = [];
        for (const task of model.tasks) {
          if (task.carriedTo) continue;
          if (task.repeat) continue;
          if (['monthly', 'project', 'note'].indexOf(task.category) >= 0) continue;
          const startDate = String(task.startDate || '');
          if (!startDate || startDate >= mondayKey) continue;
          const completed = task.completedDates || {};
          if (task.done || Object.keys(completed).some((key) => completed[key])) continue;
          sources.push(task);
        }
        for (const source of sources) {
          source.carriedTo = mondayKey;
          const copy = Object.assign({}, source, {
            id: model.nextTaskId++,
            startDate: mondayKey,
            createdAt: new Date().toISOString(),
            done: false,
            completedDates: {},
            carriedTo: '',
            carriedFrom: source.id,
            carriedFromDate: source.startDate,
          });
          model.tasks.push(copy);
        }
        return sources.length;
      };

      model.applyCarryOver = () => {
        const restored = model.restoreMovedTasks();
        const carried = model.carryOverUnfinishedToMonday();
        if (restored > 0 || carried > 0) {
          model.schedulePersist();
          if (carried > 0) model.showToast(tr('rolledOver').replace('{n}', String(carried)));
          model.bump();
        }
        return carried;
      };

      // ----- period view ---------------------------------------------------
      model.weekRows = () => {
        const base = addDays(monday(), model.weekOffset * 7);
        return [0, 1].map((row) => {
          const start = addDays(base, row * 7);
          const end = addDays(start, 6);
          const title =
            (row ? tr('nextWeekTitle') : tr('thisWeekTitle')) +
            dateText(start) + ' – ' + (end.getMonth() + 1) + ' ' + tr('monthUnit') + ' ' + end.getDate() + ' ' + tr('dayUnit') +
            (row ? tr('weekSuffixPre') + weekNumber(start) + tr('weekSuffixPost') : '（第' + weekNumber(start) + '周）');
          return {
            title,
            days: WEEKDAYS.map((weekday, index) => {
              const date = addDays(start, index);
              return { date, key: keyOf(date), weekday };
            }),
          };
        });
      };

      model.weekLabel = () => {
        const title = model.weekRows()[0].title;
        return title.replace('本周待办 · ', '').replace(tr('thisWeekTitle'), '');
      };

      model.currentWeekNumber = () => weekNumber(monday());
      model.monthViewDate = () => new Date(today().getFullYear(), today().getMonth() + model.monthOffset, 1);
      model.monthTitle = () => model.monthViewDate().getFullYear() + '年' + (model.monthViewDate().getMonth() + 1) + '月 · 月度待办';

      model.monthCells = () => {
        const first = model.monthViewDate();
        const cells = new Array((first.getDay() + 6) % 7).fill(null);
        const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= total; day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
        return cells;
      };

      model.shiftWeek = (amount) => {
        model.weekOffset += amount;
        model.bump();
      };
      model.shiftMonth = (amount) => {
        model.monthOffset += amount;
        model.bump();
      };

      // ----- create / edit tasks ------------------------------------------
      model.createTask = (text, category, repeat, customDays, startDate, month) => ({
        id: model.nextTaskId++,
        text,
        category: category || '',
        repeat: repeat || '',
        customDays: (customDays || []).slice(),
        startDate: startDate || keyOf(today()),
        createdAt: new Date().toISOString(),
        month: month || '',
        done: false,
        completedDates: {},
        carriedTo: '',
        carriedFrom: null,
        carriedFromDate: '',
      });

      model.openEditor = (day) => {
        model.editorDay = day.key;
        model.bump();
      };
      model.closeEditor = () => {
        model.editorDay = '';
        model.bump();
      };

      model.resetDraft = () => {
        model.draft.text = '';
        model.draft.category = '';
        model.draft.repeat = '';
        model.draft.month = '';
        model.draft.customDays = [];
      };

      model.saveTodo = (day) => {
        if (!model.draft.text.trim()) return;
        if (model.draft.repeat === 'custom' && model.draft.customDays.length === 0) {
          model.showToast(tr('customDaysRequired'));
          return;
        }
        const task = model.createTask(model.draft.text.trim(), model.draft.category, model.draft.repeat, model.draft.customDays, day.key, model.draft.month);
        model.tasks.push(task);
        model.schedulePersist();
        model.resetDraft();
        model.closeEditor();
        model.showToast(tr('todoSaved'));
      };

      model.toggleTask = (task) => {
        const source = model.taskSource(task);
        const dateKey = task.occurrenceKey || source.startDate;
        source.completedDates[dateKey] = !source.completedDates[dateKey];
        source.done = source.completedDates[dateKey];
        model.schedulePersist();
        model.showToast(source.completedDates[dateKey] ? tr('completedTodo') : tr('restoredTodo'));
      };

      // ----- drag a weekly card onto another day (date-only change) ---------
      model.beginTaskDrag = (task) => {
        model.dragKey = String((task && task.occurrenceKey) || '');
        model.bump();
      };
      model.endTaskDrag = () => {
        if (!model.dragKey && !model.dragOverKey) return;
        model.dragKey = '';
        model.dragOverKey = '';
        model.bump();
      };
      model.dragOverDay = (key) => {
        if (model.dragOverKey === key) return;
        model.dragOverKey = key;
        model.bump();
      };
      model.clearDragOver = (key) => {
        if (model.dragOverKey !== key) return;
        model.dragOverKey = '';
        model.bump();
      };
      /**
       * Move one occurrence to another date: only startDate (plus the moved completion
       * entry) changes; every other field is kept. A failed save restores the snapshot.
       */
      model.moveTaskToDate = (task, targetKey) => {
        const source = model.taskSource(task);
        const fromKey = String((task && task.occurrenceKey) || source.startDate || '');
        model.endTaskDrag();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(targetKey || ''))) return;
        if (!source || fromKey === targetKey) return;
        const before = {
          startDate: source.startDate,
          completedDates: JSON.parse(JSON.stringify(source.completedDates || {})),
          done: Boolean(source.done),
        };
        const dates = (source.completedDates = source.completedDates || {});
        if (Object.prototype.hasOwnProperty.call(dates, fromKey)) {
          const moved = dates[fromKey];
          delete dates[fromKey];
          dates[targetKey] = moved;
        }
        source.startDate = targetKey;
        source.done = Boolean(dates[targetKey]);
        model.rollbackMove = { taskId: Number(source.id), before };
        model.schedulePersist();
        model.showToast(tr('taskMoved').replace('{date}', targetKey));
      };

      model.openTaskEditor = (task) => {
        const source = model.taskSource(task);
        model.editingTask = source;
        model.taskEditDraft.text = source.text || '';
        model.taskEditDraft.category = source.category || '';
        model.taskEditDraft.repeat = source.repeat || '';
        model.taskEditDraft.month = source.month || '';
        model.taskEditDraft.customDays = Array.isArray(source.customDays) ? source.customDays.slice() : [];
        model.bump();
      };

      model.closeTaskEditor = () => {
        model.editingTask = null;
        model.taskEditDraft = { text: '', category: '', repeat: '', month: '', customDays: [] };
        model.bump();
      };

      model.saveTaskEdit = () => {
        if (!model.taskEditDraft.text.trim()) return;
        if (model.taskEditDraft.repeat === 'custom' && model.taskEditDraft.customDays.length === 0) {
          model.showToast(tr('customDaysRequired'));
          return;
        }
        const task = model.editingTask;
        if (!task) return;
        task.text = model.taskEditDraft.text.trim();
        task.repeat = model.taskEditDraft.repeat;
        task.month = model.taskEditDraft.month;
        task.customDays = model.taskEditDraft.customDays.slice();
        task.category = model.taskEditDraft.category;
        model.schedulePersist();
        model.closeTaskEditor();
        model.showToast(tr('todoUpdated'));
      };

      model.deleteTask = () => {
        const task = model.editingTask;
        if (!task) return;
        const index = model.tasks.indexOf(task);
        if (index >= 0) model.tasks.splice(index, 1);
        model.schedulePersist();
        model.closeTaskEditor();
        model.showToast(tr('todoDeleted'));
      };

      // ----- category view -------------------------------------------------
      model.displayCategories = () => [
        { key: 'weekly', name: tr('catWeekly') },
        { key: 'monthly', name: tr('catMonthly') },
        { key: 'project', name: tr('catProject') },
        { key: 'note', name: tr('catNote') },
      ];

      model.itemsFor = (key) => model.tasks.filter((task) => task.category === key);

      model.openCategoryEditor = (category) => {
        model.categoryEditorKey = category.key;
        model.categoryText = '';
        model.categoryDraft = { repeat: '', month: '', weeklyType: 'periodic', director: '', group: '', parentUnit: '', customDays: [] };
        model.bump();
      };

      model.closeCategoryEditor = () => {
        model.categoryEditorKey = '';
        model.categoryText = '';
        model.categoryDraft = { repeat: '', month: '', weeklyType: 'periodic', director: '', group: '', parentUnit: '', customDays: [] };
        model.bump();
      };

      model.saveCategory = (category) => {
        const text = model.categoryText.trim();
        if (!text) return;
        if (category.key === 'project') {
          model.projects.push({
            id: model.nextProjectId++,
            name: text,
            director: model.categoryDraft.director.trim(),
            group: model.categoryDraft.group.trim(),
            parentUnit: model.categoryDraft.parentUnit.trim(),
            done: false,
            addingProblem: false,
            collapsed: { problem: false },
            draft: { problem: '' },
            records: { problem: [] },
          });
        } else {
          if (model.categoryDraft.repeat === 'custom' && model.categoryDraft.customDays.length === 0) {
            model.showToast(tr('customDaysRequired'));
            return;
          }
          const taskCategory = category.key === 'weekly' ? model.categoryDraft.weeklyType : category.key;
          const task = model.createTask(text, taskCategory, model.categoryDraft.repeat, model.categoryDraft.customDays, keyOf(today()), model.categoryDraft.month);
          model.tasks.push(task);
        }
        model.schedulePersist();
        model.closeCategoryEditor();
        model.showToast(tr('categoryAdded') + category.name);
      };

      // ----- weekly occurrences -------------------------------------------
      model.currentWeekDates = () => WEEKDAYS.map((unused, index) => addDays(monday(), index));

      model.firstCurrentWeekDate = (task) => model.currentWeekDates().find((date) => model.isTaskOnDate(task, date)) || null;

      model.latestCompletedWeekDate = (task) => {
        const currentWeek = model.currentWeekDates().map(keyOf);
        const dates = Object.keys(task.completedDates || {})
          .filter((date) => task.completedDates[date] && currentWeek.indexOf(date) >= 0)
          .map(parseDateKey)
          .sort((left, right) => left - right);
        return dates.length > 0 ? dates[dates.length - 1] : null;
      };

      model.weeklyOccurrences = () => {
        const views = [];
        const currentWeek = model.currentWeekDates();
        for (const task of model.tasks) {
          if (['', 'periodic', 'temporary'].indexOf(task.category) < 0) continue;
          for (const date of currentWeek) {
            if (!model.isTaskOnDate(task, date)) continue;
            const occurrenceKey = keyOf(date);
            views.push(Object.assign({}, task, { id: task.id + '-' + occurrenceKey, occurrenceKey, source: task }));
          }
        }
        views.sort((left, right) => {
          const leftDone = Boolean(left.source.completedDates && left.source.completedDates[left.occurrenceKey]);
          const rightDone = Boolean(right.source.completedDates && right.source.completedDates[right.occurrenceKey]);
          return (
            Number(leftDone) - Number(rightDone) ||
            left.occurrenceKey.localeCompare(right.occurrenceKey) ||
            (Number(left.source.id) || 0) - (Number(right.source.id) || 0)
          );
        });
        return views;
      };

      model.isCategoryItemDone = (category, item) => {
        if (category.key !== 'weekly') return Boolean(item.done);
        const source = model.taskSource(item);
        return Boolean(item.occurrenceKey ? source.completedDates && source.completedDates[item.occurrenceKey] : source.done || model.latestCompletedWeekDate(source));
      };

      model.periodicItemSchedule = (task, weekly) => {
        if (task.repeat === 'daily') return '本周每天';
        if (task.repeat === 'weekly') return '本周' + weekdayForDate(parseDateKey(task.startDate));
        if (task.repeat === 'custom') return '本周' + task.customDays.join('、');
        if (task.repeat === 'monthly') return '每月' + parseDateKey(task.startDate).getDate() + '日';
        if (!weekly) return task.startDate || '';
        const date = model.firstCurrentWeekDate(task) || parseDateKey(task.startDate);
        return '本周' + weekdayForDate(date);
      };

      model.weeklyItemSchedule = (item) => {
        const source = model.taskSource(item);
        if (source.category === 'temporary') {
          const date = item.occurrenceKey ? parseDateKey(item.occurrenceKey) : model.latestCompletedWeekDate(source) || model.firstCurrentWeekDate(source);
          return date ? tr('temporaryKind') + ' · ' + weekdayForDate(date) : tr('temporaryKind');
        }
        return model.periodicItemSchedule(source, true);
      };

      model.categoryItemSchedule = (category, item) => {
        if (category.key === 'monthly') return '';
        if (category.key === 'weekly') return model.weeklyItemSchedule(item);
        if (category.key !== 'periodic') return '';
        return model.periodicItemSchedule(item, false);
      };

      model.createdAtText = (item) => {
        const source = model.taskSource(item);
        const value = String(source.createdAt || source.startDate || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return timeText(parseDateKey(value));
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : timeText(date);
      };

      model.isCurrentMonthItem = (item) => {
        const month = item.month || String(item.startDate || '').slice(0, 7);
        return month === monthKeyOf(today());
      };

      model.isMonthlyItemCollapsed = (item) => {
        const key = String(item.id);
        if (Object.prototype.hasOwnProperty.call(model.monthlyCollapsed, key)) return model.monthlyCollapsed[key];
        return !model.isCurrentMonthItem(item);
      };

      model.setMonthlyCollapsed = (category, collapsed) => {
        for (const item of model.itemsFor('monthly')) model.monthlyCollapsed[String(item.id)] = collapsed;
        model.bump();
      };

      model.monthlyItemLabel = (item) => {
        const month = item.month || String(item.startDate || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return month || '未填写';
        return month.slice(0, 4) + '年' + Number(month.slice(5, 7)) + '月';
      };

      model.visibleCategoryItems = (category) => {
        if (category.key === 'weekly') return model.weeklyOccurrences();
        const items = model.itemsFor(category.key);
        if (category.key !== 'note') return items;
        const query = model.noteSearch.trim().toLowerCase();
        return items
          .filter((item) => !query || String(item.text || '').toLowerCase().indexOf(query) >= 0)
          .slice()
          .sort((left, right) => {
            const leftTime = Date.parse(left.createdAt || '') || 0;
            const rightTime = Date.parse(right.createdAt || '') || 0;
            return rightTime - leftTime || (Number(right.id) || 0) - (Number(left.id) || 0);
          });
      };

      // ----- item inline editing -------------------------------------------
      model.itemEditKey = (item) => (item ? String(model.taskSource(item).id) + ':' + String(item.occurrenceKey || '') : '');
      model.isEditingItem = (item) => model.editingItemKey !== '' && model.editingItemKey === model.itemEditKey(item);

      model.startEdit = (item) => {
        model.editingItemKey = model.itemEditKey(item);
        model.editingText = model.taskSource(item).text || '';
        model.bump();
      };
      model.cancelItem = () => {
        model.editingItemKey = '';
        model.editingText = '';
        model.bump();
      };
      model.saveItem = (item) => {
        if (!model.editingText.trim()) return;
        model.taskSource(item).text = model.editingText.trim();
        model.schedulePersist();
        model.cancelItem();
        model.showToast(tr('itemUpdated'));
      };
      model.deleteItem = (item) => {
        const source = model.taskSource(item);
        const index = model.tasks.indexOf(source);
        if (index >= 0) model.tasks.splice(index, 1);
        model.schedulePersist();
        model.showToast(tr('itemDeleted'));
      };
      model.toggleItem = (item) => {
        const source = model.taskSource(item);
        if (source.completedDates) {
          const dateKey = item.occurrenceKey || keyOf(today());
          source.completedDates[dateKey] = !source.completedDates[dateKey];
          source.done = source.completedDates[dateKey];
        } else {
          source.done = !source.done;
        }
        model.schedulePersist();
        model.bump();
      };

      // ----- projects ------------------------------------------------------
      model.filteredProjects = () => {
        const query = model.projectSearch.trim().toLowerCase();
        if (!query) return model.projects;
        return model.projects.filter((project) =>
          [project.name, project.director, project.group, project.parentUnit].some((value) => String(value || '').toLowerCase().indexOf(query) >= 0),
        );
      };

      model.projectMeta = (project) => [project.director || '未填写', project.group || '未填写', project.parentUnit || '未填写'].join(' | ');

      model.toggleProjectLog = (project, key) => {
        project.collapsed[key] = !project.collapsed[key];
        model.schedulePersist();
        model.bump();
      };

      model.setProjectsCollapsed = (collapsed) => {
        for (const project of model.projects) project.collapsed.problem = collapsed;
        model.bump();
      };

      model.editProject = (project) => {
        model.editingProject = project;
        model.projectEditDraft = {
          name: project.name || '',
          director: project.director || '',
          group: project.group || '',
          parentUnit: project.parentUnit || '',
        };
        model.bump();
      };
      model.closeProjectEditor = () => {
        model.editingProject = null;
        model.projectEditDraft = { name: '', director: '', group: '', parentUnit: '' };
        model.bump();
      };
      model.saveProjectEdit = () => {
        const project = model.editingProject;
        if (!project || !model.projectEditDraft.name.trim()) return;
        project.name = model.projectEditDraft.name.trim();
        project.director = model.projectEditDraft.director.trim();
        project.group = model.projectEditDraft.group.trim();
        project.parentUnit = model.projectEditDraft.parentUnit.trim();
        model.schedulePersist();
        model.closeProjectEditor();
        model.showToast(tr('projectUpdated'));
      };
      model.deleteProject = (project) => {
        const index = model.projects.indexOf(project);
        if (index >= 0) model.projects.splice(index, 1);
        model.schedulePersist();
        model.showToast(tr('projectDeleted'));
      };

      // ----- project records (problem log) --------------------------------
      model.addRecord = (project) => {
        const text = project.draft.problem.trim();
        if (!text) return;
        project.records.problem.unshift({ id: model.nextRecordId++, createdAt: timeText(new Date()), text, highlights: [] });
        project.draft.problem = '';
        project.addingProblem = false;
        model.schedulePersist();
        model.showToast(tr('recordAdded'));
      };
      model.startRecordEdit = (record) => {
        model.editingRecord = record;
        model.editingRecordText = record.text;
        model.editingRecordHighlights = normalizeHighlights(record.highlights, record.text);
        model.editingRecordDropped = 0;
        model.highlightBar = null;
        model.bump();
      };
      model.cancelRecordEdit = () => {
        model.editingRecord = null;
        model.editingRecordText = '';
        model.editingRecordHighlights = [];
        model.editingRecordDropped = 0;
        model.highlightBar = null;
        model.bump();
      };
      /** Typing keeps existing highlights aligned; runs hit by the edit are dropped and counted. */
      model.updateEditingRecordText = (nextText) => {
        const previous = model.editingRecordText || '';
        if (nextText === previous) return;
        const before = (model.editingRecordHighlights || []).length;
        const adjusted = adjustHighlights(previous, nextText, model.editingRecordHighlights);
        if (adjusted.length < before) model.editingRecordDropped += before - adjusted.length;
        model.editingRecordHighlights = adjusted;
        model.editingRecordText = nextText;
        model.bump();
      };
      model.saveRecord = (record) => {
        const text = model.editingRecordText.trim();
        if (!text) return;
        const draftCount = (model.editingRecordHighlights || []).length;
        const normalized = normalizeHighlights(model.editingRecordHighlights, text);
        const dropped = model.editingRecordDropped + Math.max(0, draftCount - normalized.length);
        record.text = text;
        record.highlights = normalized;
        model.schedulePersist();
        model.cancelRecordEdit();
        model.showToast(tr('recordUpdated') + (dropped > 0 ? ' · ' + tr('hlDropped').replace('{n}', String(dropped)) : ''));
      };

      model.findRecordById = (recordId) => {
        for (const project of model.projects) {
          const list = (project.records && project.records.problem) || [];
          const found = list.find((record) => Number(record.id) === Number(recordId));
          if (found) return found;
        }
        return null;
      };

      // ----- delete one problem record (Host is the source of truth) --------
      model.requestDeleteRecord = (project, record) => {
        model.recordDeleteTarget = {
          projectId: project.id,
          projectName: project.name,
          recordId: record.id,
          createdAt: String(record.createdAt || ''),
          text: String(record.text || ''),
        };
        model.bump();
      };
      model.cancelDeleteRecord = () => {
        if (!model.recordDeleteTarget) return;
        model.recordDeleteTarget = null;
        model.bump();
      };
      model.confirmDeleteRecord = () => {
        const target = model.recordDeleteTarget;
        if (!target || model.recordDeleting) return;
        model.recordDeleting = true;
        model.bump();
        callApi('deleteProblemRecord', {
          projectId: target.projectId,
          recordId: target.recordId,
          text: target.text,
        })
          .then((data) => {
            model.recordDeleting = false;
            const project = model.projects.find((candidate) => String(candidate.id) === String(target.projectId));
            if (project && project.records && Array.isArray(project.records.problem)) {
              project.records.problem = project.records.problem.filter(
                (record) => String(record.id) !== String(target.recordId),
              );
            }
            if (data && typeof data.rev === 'string') model.baseRev = data.rev;
            model.recordDeleteTarget = null;
            model.recount();
            writeLocalDocument(documentOf());
            model.bump();
            model.showToast(tr('recordDeleted'));
          })
          .catch((error) => {
            model.recordDeleting = false;
            model.bump();
            model.showToast((error && error.message) || tr('recordDeleteFailed'));
          });
      };

      /** Show the floating highlight bar for one selection (view or edit mode). */
      model.openHighlightBar = (recordId, start, end, x, y, mode) => {
        if (!(end > start)) return;
        const record = model.findRecordById(recordId);
        const list = mode === 'edit' ? model.editingRecordHighlights : record ? record.highlights : [];
        model.highlightBar = {
          recordId: Number(recordId),
          start,
          end,
          x,
          y,
          mode: mode === 'edit' ? 'edit' : 'view',
          overlap: hasOverlapHighlight(list, start, end),
        };
        model.bump();
      };
      model.closeHighlightBar = () => {
        if (!model.highlightBar) return;
        model.highlightBar = null;
        model.bump();
      };
      model.applyRecordHighlight = () => {
        const bar = model.highlightBar;
        if (!bar) return;
        if (bar.mode === 'edit') {
          model.editingRecordHighlights = addHighlightRange(model.editingRecordHighlights, bar.start, bar.end);
        } else {
          const record = model.findRecordById(bar.recordId);
          if (record) {
            record.highlights = addHighlightRange(record.highlights, bar.start, bar.end);
            model.schedulePersist();
            model.showToast(tr('hlApplied'));
          }
        }
        model.highlightBar = null;
        collapseRecordSelection();
        model.bump();
      };
      model.removeRecordHighlight = () => {
        const bar = model.highlightBar;
        if (!bar) return;
        if (bar.mode === 'edit') {
          model.editingRecordHighlights = subtractHighlightRange(model.editingRecordHighlights, bar.start, bar.end);
        } else {
          const record = model.findRecordById(bar.recordId);
          if (record) {
            record.highlights = subtractHighlightRange(record.highlights, bar.start, bar.end);
            model.schedulePersist();
          }
          model.showToast(tr('hlRemoved'));
        }
        model.highlightBar = null;
        collapseRecordSelection();
        model.bump();
      };
      model.clearRecordHighlights = () => {
        const bar = model.highlightBar;
        if (!bar) return;
        if (bar.mode === 'edit') {
          model.editingRecordHighlights = [];
        } else {
          const record = model.findRecordById(bar.recordId);
          if (record) {
            record.highlights = [];
            model.schedulePersist();
          }
        }
        model.showToast(tr('hlCleared'));
        model.highlightBar = null;
        collapseRecordSelection();
        model.bump();
      };

      // ----- misc ----------------------------------------------------------
      model.toggleFullscreen = (key) => {
        model.fullscreenCategory = model.fullscreenCategory === key ? '' : key;
        model.bump();
      };
      model.openImport = () => {
        model.importOpen = true;
        model.importText = '';
        model.importMode = 'merge';
        model.importNotice = '';
        model.bump();
      };
      model.closeImport = () => {
        model.importOpen = false;
        model.importText = '';
        model.importNotice = '';
        model.bump();
      };
      model.applyImport = () => {
        let parsed = null;
        try {
          parsed = JSON.parse(model.importText);
        } catch (error) {
          parsed = null;
        }
        if (!parsed || !model.importDocument(parsed, model.importMode)) {
          model.importNotice = tr('importBad');
          model.bump();
          return;
        }
        model.importOpen = false;
        model.importText = '';
        model.importNotice = '';
        model.showToast(tr('imported') + ' · ' + model.tasks.length);
      };

      // ----- meeting notes: paste a transcript into the shared inbox ----------------
      model.openMeeting = () => {
        model.meetingOpen = true;
        model.meetingSubject = '';
        model.meetingDate = keyOf(today());
        model.meetingTranscript = '';
        model.meetingError = '';
        model.meetingNotice = '';
        model.meetingDropNotice = '';
        model.bump();
      };
      model.closeMeeting = () => {
        model.meetingOpen = false;
        model.meetingError = '';
        model.meetingDropNotice = '';
        model.bump();
      };
      model.saveMeeting = () => {
        if (model.meetingSaving) return;
        const rawSubject = model.meetingSubject.trim();
        if (!rawSubject) {
          model.meetingError = tr('meetingSubjectRequired');
          model.bump();
          return;
        }
        const info = meetingFileInfo(rawSubject);
        const subject = info.subject || rawSubject;
        const transcript = model.meetingTranscript;
        if (!transcript.trim()) {
          model.meetingError = tr('meetingTranscriptRequired');
          model.bump();
          return;
        }
        // A pasted file name in the subject also contributes the date and is cleaned up.
        if (info.date) {
          model.meetingDate = info.date;
          model.meetingSubject = subject;
        }
        const date = info.date || model.meetingDate || keyOf(today());
        model.meetingSaving = true;
        model.meetingError = '';
        model.bump();
        callApi('saveMeeting', { subject, date, transcript })
          .then((data) => {
            model.meetingSaving = false;
            model.meetingOpen = false;
            model.meetingSubject = '';
            model.meetingTranscript = '';
            model.meetingDropNotice = '';
            const savedPath = data && data.path ? String(data.path) : '';
            model.meetingNotice = tr('meetingSaved').replace('{path}', savedPath);
            model.showToast(model.meetingNotice);
            model.bump();
          })
          .catch((error) => {
            model.meetingSaving = false;
            model.meetingError = error && error.message ? error.message : tr('meetingSaveFailed');
            model.bump();
          });
      };

      /**
       * Handle dropped/picked transcript files with strict serial processing.
       *
       * Reads and saves ONE file at a time (never `Promise.all`), with a short gap
       * between save requests: parallel `file.text()` reads plus back-to-back
       * `saveMeeting` POSTs could take the host down (2026-11-04 crash report).
       * One file fills the form; several are saved one by one; folders and invalid
       * entries are skipped and reported instead of throwing.
       */
      model.handleMeetingDrop = async (fileList) => {
        if (model.meetingSaving) return;
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        if (files.length > MEETING_MAX_FILES) {
          model.meetingError = tr('meetingTooManyFiles').replace('{n}', String(MEETING_MAX_FILES));
          model.showToast(model.meetingError);
          model.bump();
          return;
        }
        const failures = [];
        const accepted = [];
        let totalBytes = 0;
        for (const file of files) {
          const fileName = String(file && file.name ? file.name : '');
          if (isLikelyFolder(file)) {
            failures.push(fileName + '：' + tr('meetingFolderUnsupported'));
            continue;
          }
          const dot = fileName.lastIndexOf('.');
          const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
          if (['.md', '.txt'].indexOf(extension) < 0) {
            failures.push(fileName + '：' + tr('meetingUnsupported'));
            continue;
          }
          const size = Number((file && file.size) || 0);
          if (size > MEETING_MAX_FILE_BYTES) {
            failures.push(fileName + '：' + tr('meetingTooLarge'));
            continue;
          }
          totalBytes += size;
          if (totalBytes > MEETING_MAX_TOTAL_BYTES) {
            model.meetingError = tr('meetingTotalTooLarge').replace('{n}', '20MB');
            model.showToast(model.meetingError);
            model.bump();
            return;
          }
          accepted.push(file);
        }
        if (accepted.length === 0) {
          model.meetingError = failures.join('；');
          model.showToast(model.meetingError);
          model.bump();
          return;
        }
        try {
          if (accepted.length === 1) {
            const file = accepted[0];
            const text = await file.text();
            const info = meetingFileInfo(file.name);
            model.meetingSubject = info.subject;
            if (info.date) model.meetingDate = info.date;
            model.meetingTranscript = String(text || '');
            model.meetingError = failures.join('；');
            model.meetingDropNotice = info.date ? '' : tr('meetingNoSourceDate');
            model.bump();
            return;
          }
          model.meetingSaving = true;
          model.meetingError = '';
          model.bump();
          const saved = [];
          const failed = failures.slice();
          let missingDate = 0;
          for (const file of accepted) {
            reportClientTrace('meeting-save', 'start ' + String(file.name || '') + ' size=' + String((file && file.size) || 0));
            try {
              const text = await file.text();
              const info = meetingFileInfo(file.name);
              if (!info.date) missingDate += 1;
              const data = await callApi('saveMeeting', {
                subject: info.subject,
                date: info.date || keyOf(today()),
                transcript: String(text || ''),
              });
              saved.push(data && data.path ? String(data.path) : info.subject);
              reportClientTrace('meeting-save', 'ok ' + String(file.name || '') + ' chars=' + String((text || '').length));
            } catch (error) {
              failed.push(String((file && file.name) || '') + '：' + (error && error.message ? error.message : tr('meetingSaveFailed')));
              reportClientTrace('meeting-save', 'fail ' + String(file.name || '') + ' ' + String((error && error.message) || error));
            }
            await sleep(MEETING_SAVE_GAP_MS);
          }
          model.meetingSaving = false;
          model.meetingOpen = false;
          model.meetingSubject = '';
          model.meetingTranscript = '';
          model.meetingDropNotice = '';
          const parts = [tr('meetingBatchSaved').replace('{n}', String(saved.length))];
          if (missingDate > 0) parts.push(tr('meetingNoSourceDate'));
          if (failed.length > 0) {
            parts.push(tr('meetingBatchFailed').replace('{m}', String(failed.length)) + '：' + failed.join('；'));
          }
          model.meetingNotice = parts.join('；');
          model.showToast(model.meetingNotice);
          model.bump();
        } catch (error) {
          model.meetingSaving = false;
          model.meetingError = error && error.message ? error.message : tr('meetingSaveFailed');
          model.showToast(model.meetingError);
          model.bump();
          reportClientError(error, 'meeting-drop');
        }
      };

      // ----- maintenance: Host-written text bridge (.bin/.txt -> .md/...) ---------
      model.openMaintenance = () => {
        model.maintenanceOpen = true;
        model.maintenanceSrc = '';
        model.maintenanceDest = '';
        model.maintenanceOverwrite = false;
        model.maintenanceResult = '';
        model.maintenanceError = '';
        model.maintenanceBusy = false;
        model.bump();
      };
      model.closeMaintenance = () => {
        model.maintenanceOpen = false;
        model.bump();
      };
      model.runMaintenance = () => {
        if (model.maintenanceBusy) return;
        const src = model.maintenanceSrc.trim();
        const dest = model.maintenanceDest.trim();
        if (!src || !dest) {
          model.maintenanceError = tr('maintenanceFailed') + '：src/dest 不能为空';
          model.bump();
          return;
        }
        model.maintenanceBusy = true;
        model.maintenanceError = '';
        model.maintenanceResult = '';
        model.bump();
        callApi('hostCopyText', { src, dest, overwrite: model.maintenanceOverwrite === true })
          .then((data) => {
            model.maintenanceBusy = false;
            model.maintenanceResult =
              tr('maintenanceOk')
                .replace('{bytes}', String(data && data.bytes != null ? data.bytes : 0))
                .replace('{sha256}', String((data && data.sha256) || '')) +
              '\n' +
              tr('maintenanceSrcKept').replace('{path}', String((data && data.src) || src)) +
              '\n' +
              tr('maintenanceDestDone').replace('{path}', String((data && data.dest) || dest));
            model.bump();
          })
          .catch((error) => {
            model.maintenanceBusy = false;
            const code = error && error.code ? error.code + '：' : '';
            model.maintenanceError = code + (error && error.message ? error.message : tr('maintenanceFailed'));
            model.bump();
          });
      };

      return model;
    }

    // -----------------------------------------------------------------------
    // Icons
    // -----------------------------------------------------------------------

    /** Sidebar entry glyph: original artwork, colored by the surrounding control. */
    function TodoIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 18;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: props.active ? 2 : 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block', pointerEvents: 'none' },
        },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 16, rx: 3 }),
        h('path', { d: 'M7.6 10.4l1.5 1.5 2.8-2.9' }),
        h('path', { d: 'M13.2 10.4h3.6' }),
        h('path', { d: 'M7.6 15.6l1.5 1.5 2.8-2.9' }),
        h('path', { d: 'M13.2 15.6h3.6' }),
      );
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        installCrashReporters();
        // Register one dictionary per built-in locale: Chinese locales get ZH, English
        // locales get EN, and anything else keeps the English defaults.
        ctx.effect(() => {
          const disposers = [];
          const register = (id, dict) => {
            try {
              disposers.push(ctx.locale.register(NS, id, dict));
            } catch (error) {
              console.error('[sidebar-todo] locale registration failed for ' + id, error);
            }
          };
          try {
            for (const definition of ctx.locale.getLocale().locales) {
              if (/^zh/i.test(definition.id)) register(definition.id, ZH);
              else if (/^en/i.test(definition.id)) register(definition.id, EN);
            }
          } catch (error) {
            console.error('[sidebar-todo] reading the locale catalog failed', error);
          }
          if (disposers.length === 0) register('en', EN);
          return () => {
            for (const dispose of disposers.splice(0)) {
              try {
                dispose();
              } catch (error) {
                /* the locale service may already be gone while unloading */
              }
            }
          };
        });

        const translate = ctx.locale.bind(NS);
        const tr = (key) => {
          const value = translate(key);
          if (typeof value === 'string' && value !== key) return value;
          return Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key;
        };

        const REPEAT_OPTIONS = () => [
          ['', tr('repNone')],
          ['daily', tr('repDaily')],
          ['weekly', tr('repWeekly')],
          ['monthly', tr('repMonthly')],
          ['custom', tr('repCustom')],
        ];

        const CATEGORY_OPTIONS = () => [
          ['', tr('noCategory')],
          ['periodic', tr('catPeriodic')],
          ['monthly', tr('catMonthly')],
          ['project', tr('catProject')],
          ['temporary', tr('catTemporary')],
          ['note', tr('catNote')],
        ];

        const optionNodes = (options) => options.map((pair) => h('option', { key: pair[0], value: pair[0] }, pair[1]));

        const repeatSelect = (value, onChange) => h('select', { className: 'dsh-todo-field', value, onChange }, optionNodes(REPEAT_OPTIONS()));
        const categorySelect = (value, onChange) => h('select', { className: 'dsh-todo-field', value, onChange }, optionNodes(CATEGORY_OPTIONS()));

        const customDayPicker = (selected, onChange) =>
          h(
            'div',
            { className: 'dsh-todo-custom-days' },
            WEEKDAYS.map((name) =>
              h(
                'label',
                { key: name },
                h('input', {
                  type: 'checkbox',
                  checked: selected.indexOf(name) >= 0,
                  onChange: (event) => {
                    const next = selected.slice();
                    const index = next.indexOf(name);
                    if (event.target.checked && index < 0) next.push(name);
                    if (!event.target.checked && index >= 0) next.splice(index, 1);
                    onChange(next);
                  },
                }),
                name,
              ),
            ),
          );

        /** Textareas already focused+selected once, so re-renders do not steal the caret. */
        const editFocusOnce = new WeakSet();
        /** Every mounted auto-growing textarea (works even inside a shadow root). */
        const autoGrowNodes = new Set();

        function TodoPanel() {
          const [revision, setRevision] = React.useState(0);
          const [composing, setComposing] = React.useState(false);
          const [dropActive, setDropActive] = React.useState(false);
          const meetingFileInputRef = React.useRef(null);
          const modelRef = React.useRef(null);
          if (!modelRef.current) modelRef.current = createModel(tr);
          const model = modelRef.current;
          model.bump = () => setRevision((value) => value + 1);

          React.useEffect(() => {
            model.bootstrap();
            const onBeforeUnload = () => model.flush();
            window.addEventListener('beforeunload', onBeforeUnload);
            return () => {
              window.removeEventListener('beforeunload', onBeforeUnload);
              model.dispose();
            };
          }, []);

          React.useEffect(() => {
            try {
              return ctx.locale.subscribe(() => setRevision((value) => value + 1));
            } catch (error) {
              return undefined;
            }
          }, []);

          // Recompute every auto-growing textarea after each render: the ref callback may run
          // before the browser lays the value out, so this pass guarantees the full height.
          React.useEffect(() => {
            for (const node of autoGrowNodes) {
              if (node && node.isConnected !== false) autoGrowTextarea(node);
            }
            if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
              const nodes = document.querySelectorAll('textarea[data-autogrow]');
              for (const node of nodes) autoGrowTextarea(node);
            }
          });

          const backToChat = () => {
            try {
              ctx.layout.selectPanel(null);
            } catch (error) {
              console.error('[sidebar-todo] switching back to the conversation failed', error);
            }
          };

          // The highlight bar closes on an outside press, on scroll and on Escape.
          React.useEffect(() => {
            const onPointerDown = (event) => {
              if (!model.highlightBar) return;
              const target = event.target;
              if (target && target.closest && (target.closest('.dsh-todo-hlbar') || target.closest('.dsh-todo-record-text') || target.closest('.dsh-todo-record-input'))) return;
              model.closeHighlightBar();
            };
            const onScroll = () => {
              if (model.highlightBar) model.closeHighlightBar();
            };
            const onKeyDown = (event) => {
              if (event.key === 'Escape' && model.highlightBar) model.closeHighlightBar();
            };
            window.addEventListener('mousedown', onPointerDown, true);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('keydown', onKeyDown);
            return () => {
              window.removeEventListener('mousedown', onPointerDown, true);
              window.removeEventListener('scroll', onScroll, true);
              window.removeEventListener('keydown', onKeyDown);
            };
          }, []);

          const recordInputRef = React.useRef(null);

          /** Grow the record editor to its content, both on entry and while typing. */
          const syncRecordInputHeight = (element) => {
            if (!element) return;
            element.style.height = 'auto';
            element.style.height = Math.max(element.scrollHeight || 0, 56) + 'px';
          };

          /** Place the bar under the selection, flipping when it would leave the viewport. */
          const positionHighlightBar = (clientX, clientY) => {
            const width = 268;
            const height = 40;
            const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth || 1200;
            const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight || 800;
            const x = Math.max(8, Math.min(clientX, viewportWidth - width - 8));
            let y = clientY + 14;
            if (y + height > viewportHeight - 8) y = Math.max(8, clientY - height - 10);
            return { x, y };
          };

          /** Offsets and position of the current selection inside the edit textarea. */
          const openBarFromTextarea = (event, record) => {
            const element = event.target;
            const start = typeof element.selectionStart === 'number' ? element.selectionStart : 0;
            const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : 0;
            if (end <= start) return;
            const rect = element.getBoundingClientRect();
            const x = event.clientX || rect.left + 40;
            const y = event.clientY || rect.top + 20;
            const point = positionHighlightBar(x, y);
            model.openHighlightBar(record.id, start, end, point.x, point.y, 'edit');
          };

          /** Offsets and position of the current selection inside a view-mode record. */
          const openBarFromViewSelection = (event) => {
            const selection = typeof window === 'undefined' ? null : window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            if (range.collapsed) return;
            let node = range.commonAncestorContainer;
            if (node && node.nodeType === 3) node = node.parentNode;
            const container = node && node.closest ? node.closest('.dsh-todo-record-text') : null;
            if (!container) return;
            const recordId = Number(container.getAttribute('data-record-id'));
            if (!recordId) return;
            const total = (container.textContent || '').length;
            const head = range.cloneRange();
            head.selectNodeContents(container);
            head.setEnd(range.startContainer, range.startOffset);
            const start = head.toString().length;
            const tail = range.cloneRange();
            tail.selectNodeContents(container);
            tail.setStart(range.endContainer, range.endOffset);
            const end = total - tail.toString().length;
            if (!(end > start)) return;
            const rect = range.getBoundingClientRect();
            const clientX = event && typeof event.clientX === 'number' && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
            const clientY = event && typeof event.clientY === 'number' && event.clientY > 0 ? event.clientY : rect.bottom;
            const point = positionHighlightBar(clientX, clientY);
            model.openHighlightBar(recordId, start, end, point.x, point.y, 'view');
          };

          // ----- period view -------------------------------------------------
          const AUTO_GROW_FALLBACK_MAX = 260;
          const autoGrowCap = () => {
            if (typeof window === 'undefined' || !window.innerHeight) return AUTO_GROW_FALLBACK_MAX;
            return Math.max(200, Math.floor(window.innerHeight * 0.6));
          };
          const autoGrowTextarea = (element) => {
            if (!element || typeof element.style === 'undefined') return;
            const style = element.style;
            style.height = 'auto';
            style.overflowY = 'hidden';
            const natural = Number(element.offsetHeight) || 0; // height implied by rows
            const scroll = Number(element.scrollHeight) || 0;
            const content = Math.max(natural, scroll);
            const cap = autoGrowCap();
            style.height = Math.min(content, cap) + 'px';
            style.overflowY = scroll > cap ? 'auto' : 'hidden';
          };
          /** Run now, then once after layout (rAF) and once after the task queue (setTimeout 0). */
          const scheduleAutoGrow = (element) => {
            autoGrowTextarea(element);
            if (typeof window === 'undefined') return;
            if (typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(() => autoGrowTextarea(element));
            }
            if (typeof window.setTimeout === 'function') {
              window.setTimeout(() => autoGrowTextarea(element), 0);
            }
          };
          const autoGrowRef = (element) => {
            if (!element) return;
            autoGrowNodes.add(element);
            scheduleAutoGrow(element);
            const dataset = element.dataset || {};
            if (dataset.editFocus === '1' && !editFocusOnce.has(element)) {
              editFocusOnce.add(element);
              try {
                if (typeof element.focus === 'function') element.focus();
                if (typeof element.select === 'function') element.select();
                element.scrollTop = 0;
              } catch (error) {
                /* focus/select may be unavailable */
              }
            }
          };
          const autoGrowInput = (event) => autoGrowTextarea(event && event.target);

          const renderTodoEditor = (day) =>
            h(
              'div',
              { className: 'dsh-todo-editor', onClick: (event) => event.stopPropagation() },
              h('textarea', {
                className: 'dsh-todo-field',
                rows: 3,
                placeholder: tr('todoText'),
                'data-autogrow': '1',
                ref: autoGrowRef,
                onInput: autoGrowInput,
                value: model.draft.text,
                onChange: (event) => {
                  model.draft.text = event.target.value;
                  model.bump();
                },
              }),
              categorySelect(model.draft.category, (event) => {
                model.draft.category = event.target.value;
                model.bump();
              }),
              model.draft.category === 'monthly'
                ? h('input', {
                    className: 'dsh-todo-field',
                    type: 'month',
                    value: model.draft.month,
                    onChange: (event) => {
                      model.draft.month = event.target.value;
                      model.bump();
                    },
                  })
                : null,
              repeatSelect(model.draft.repeat, (event) => {
                model.draft.repeat = event.target.value;
                model.bump();
              }),
              h('div', { className: 'dsh-todo-repeat-help' }, tr('repeatHelp')),
              model.draft.repeat === 'custom'
                ? customDayPicker(model.draft.customDays, (next) => {
                    model.draft.customDays = next;
                    model.bump();
                  })
                : null,
              h(
                'div',
                { className: 'dsh-todo-editor-actions' },
                h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-primary', onClick: () => model.saveTodo(day) }, tr('save')),
                h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeEditor() }, tr('cancel')),
              ),
            );

          const renderDay = (day) => {
            const tasks = model.tasksFor(day.date);
            let dayClass = model.isToday(day.date) ? 'dsh-todo-day dsh-todo-day--today' : 'dsh-todo-day';
            if (model.dragOverKey === day.key) dayClass += ' dsh-todo-day--drop';
            return h(
              'div',
              {
                key: day.key,
                className: dayClass,
                onDragOver: (event) => {
                  if (!model.dragKey) return;
                  event.preventDefault();
                  try {
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                  } catch (error) {
                    /* dataTransfer is read-only in some environments */
                  }
                  model.dragOverDay(day.key);
                },
                onDragLeave: (event) => {
                  if (event && event.currentTarget && event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
                  model.clearDragOver(day.key);
                },
                onDrop: (event) => {
                  if (!model.dragKey) return;
                  event.preventDefault();
                  let payload = '';
                  try {
                    payload = String((event.dataTransfer && event.dataTransfer.getData('text/plain')) || '');
                  } catch (error) {
                    payload = '';
                  }
                  const parts = payload.split('|');
                  const source = model.tasks.find((task) => Number(task.id) === Number(parts[0]));
                  if (!source) {
                    model.endTaskDrag();
                    return;
                  }
                  model.moveTaskToDate({ source, occurrenceKey: parts[1] || source.startDate }, day.key);
                },
              },
              h(
                'div',
                {
                  className: 'dsh-todo-day-head',
                  onClick: (event) => {
                    event.stopPropagation();
                    model.openEditor(day);
                  },
                },
                day.weekday + ' ',
                h('b', null, String(day.date.getDate())),
              ),
              h(
                'div',
                { className: 'dsh-todo-task-list' },
                tasks.map((task) =>
                  h(
                    'div',
                    {
                      key: task.id,
                      className: (() => {
                        const taskDone = model.isTaskDone(task);
                        let name = 'dsh-todo-task';
                        if (taskDone) name += ' dsh-todo-task--done';
                        else if (task.carriedFrom !== null && task.carriedFrom !== undefined && task.carriedFrom !== '') name += ' dsh-todo-task--overdue';
                        if (model.dragKey && model.dragKey === task.occurrenceKey) name += ' dsh-todo-task--dragging';
                        return name;
                      })(),
                      draggable: true,
                      onDragStart: (event) => {
                        try {
                          if (event && event.dataTransfer) {
                            event.dataTransfer.setData('text/plain', String(task.source.id) + '|' + String(task.occurrenceKey || ''));
                            event.dataTransfer.effectAllowed = 'move';
                          }
                        } catch (error) {
                          /* dataTransfer may be unavailable */
                        }
                        model.beginTaskDrag(task);
                      },
                      onDragEnd: () => model.endTaskDrag(),
                      title: tr('editTodo'),
                      onClick: (event) => {
                        event.stopPropagation();
                        model.toggleTask(task);
                      },
                      onDoubleClick: (event) => {
                        event.stopPropagation();
                        model.openTaskEditor(task);
                      },
                    },
                    h(
                      'span',
                      { className: 'dsh-todo-multiline' },
                      task.number + '. ' + task.text,
                      task.category === 'temporary' ? h('small', { className: 'dsh-todo-task-kind' }, tr('temporaryKind') + ' · ' + task.weekday) : null,
                    ),
                  ),
                ),
                model.editorDay === day.key ? renderTodoEditor(day) : null,
              ),
              h(
                'div',
                {
                  className: 'dsh-todo-add-zone',
                  onClick: (event) => {
                    event.stopPropagation();
                    model.openEditor(day);
                  },
                },
                tr('addZone'),
              ),
            );
          };

          const periodActions = [
            h(
              'button',
              {
                key: 'month',
                type: 'button',
                className: 'dsh-todo-action',
                onClick: () => {
                  model.showMonth = !model.showMonth;
                  model.bump();
                },
              },
              model.showMonth ? tr('weekView') : tr('monthView'),
            ),
            h(
              'button',
              {
                key: 'prev',
                type: 'button',
                className: 'dsh-todo-action',
                onClick: () => (model.showMonth ? model.shiftMonth(-1) : model.shiftWeek(-1)),
              },
              tr('prev'),
            ),
            h(
              'button',
              {
                key: 'next',
                type: 'button',
                className: 'dsh-todo-action',
                onClick: () => (model.showMonth ? model.shiftMonth(1) : model.shiftWeek(1)),
              },
              tr('next'),
            ),
            h(
              'button',
              {
                key: 'reset',
                type: 'button',
                className: 'dsh-todo-action',
                onClick: () => {
                  if (model.showMonth) model.monthOffset = 0;
                  else model.weekOffset = 0;
                  model.bump();
                },
              },
              model.showMonth ? tr('resetMonth') : tr('reset'),
            ),
          ];

          const monthView = h(
            'div',
            { className: 'dsh-todo-month' },
            h('div', { className: 'dsh-todo-month-title' }, model.monthTitle()),
            h(
              'div',
              { className: 'dsh-todo-month-grid' },
              WEEKDAYS.map((name) => h('div', { key: name, className: 'dsh-todo-month-weekday' }, name)),
              model.monthCells().map((cell, index) =>
                cell
                  ? h(
                      'div',
                      { key: index, className: model.isToday(cell) ? 'dsh-todo-month-cell--today' : '' },
                      h('b', null, String(cell.getDate())),
                      model
                        .tasksFor(cell)
                        .slice(0, 2)
                        .map((task) => h('span', { key: task.id, className: 'dsh-todo-month-task' }, task.text)),
                    )
                  : h('div', { key: index }),
              ),
            ),
          );

          const weeksView = h(
            'div',
            null,
            model.weekRows().map((row) =>
              h(
                'div',
                { key: row.title, className: 'dsh-todo-week' },
                h('div', { className: 'dsh-todo-week-title' }, row.title),
                h('div', { className: 'dsh-todo-days' }, row.days.map(renderDay)),
              ),
            ),
          );

          const periodSection = h(
            'section',
            { className: 'dsh-todo-panel' },
            h(
              'div',
              { className: 'dsh-todo-section-head' },
              h('div', null, h('h2', null, tr('periodTitle')), h('span', { className: 'dsh-todo-muted' }, tr('periodHint'))),
              h('div', { className: 'dsh-todo-actions' }, periodActions),
            ),
            model.showMonth ? monthView : weeksView,
            h('p', { className: 'dsh-todo-note' }, tr('periodNote')),
          );

          // ----- category view -----------------------------------------------
          const renderItem = (category, item, index) => {
            const source = model.taskSource(item);
            const editing = model.isEditingItem(item);
            const done = model.isCategoryItemDone(category, item);
            const schedule = model.categoryItemSchedule(category, item);
            const stacked = category.key === 'monthly' || category.key === 'note';
            const tone = category.key === 'weekly' ? model.itemTone(item, done) : '';
            let itemClass = 'dsh-todo-item';
            if (done) itemClass += ' dsh-todo-item--done';
            if (tone === 'today') itemClass += ' dsh-todo-item--today';
            if (tone === 'overdue') itemClass += ' dsh-todo-item--overdue';
            return h(
              'div',
              {
                key: item.occurrenceKey ? item.id : String(source.id) + '-' + category.key,
                className: itemClass,
              },
              editing
                ? h(
                    'div',
                    { className: 'dsh-todo-inline-editor' },
                    h('textarea', {
                      className: 'dsh-todo-field',
                      rows: 3,
                      autoFocus: true,
                      'data-autogrow': '1',
                      'data-edit-focus': '1',
                      ref: autoGrowRef,
                      onInput: autoGrowInput,
                      value: model.editingText,
                      onChange: (event) => {
                        model.editingText = event.target.value;
                        model.bump();
                      },
                    }),
                    h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.saveItem(item) }, tr('save')),
                    h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.cancelItem() }, tr('cancel')),
                  )
                : h(
                    'span',
                    { className: stacked ? 'dsh-todo-item-main dsh-todo-item-main--stacked' : 'dsh-todo-item-main' },
                    stacked
                      ? h(
                          'span',
                          { className: 'dsh-todo-item-meta-box' },
                          h('small', { className: 'dsh-todo-item-meta' }, category.key === 'monthly' ? model.monthlyItemLabel(item) : model.createdAtText(item)),
                          h(
                            'span',
                            { className: 'dsh-todo-item-actions' },
                            h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.startEdit(item) }, tr('edit')),
                            h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.deleteItem(item) }, tr('remove')),
                          ),
                        )
                      : h('b', null, index + 1 + '.'),
                    h('span', { className: 'dsh-todo-multiline' }, item.text),
                    schedule ? h('small', { className: 'dsh-todo-item-schedule' }, schedule) : null,
                  ),
              !editing && !stacked
                ? h(
                    'span',
                    { className: 'dsh-todo-item-actions' },
                    category.key === 'weekly'
                      ? h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.toggleItem(item) }, done ? tr('restore') : tr('done'))
                      : null,
                    h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.startEdit(item) }, tr('edit')),
                    h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.deleteItem(item) }, tr('remove')),
                  )
                : null,
            );
          };

          const renderCategoryEditor = (category) => {
            const draft = model.categoryDraft;
            const isProject = category.key === 'project';
            const isNote = category.key === 'note';
            return h(
              'div',
              { className: 'dsh-todo-category-editor' },
              h('textarea', {
                className: 'dsh-todo-field',
                rows: isNote ? 4 : 3,
                autoFocus: true,
                'data-autogrow': '1',
                ref: autoGrowRef,
                onInput: autoGrowInput,
                placeholder: isProject ? tr('projectName') : tr('noTask'),
                value: model.categoryText,
                onChange: (event) => {
                  model.categoryText = event.target.value;
                  model.bump();
                },
              }),
              isProject
                ? h(
                    'div',
                    { className: 'dsh-todo-category-editor-row' },
                    h('input', {
                      className: 'dsh-todo-field',
                      placeholder: tr('director'),
                      value: draft.director,
                      onChange: (event) => {
                        draft.director = event.target.value;
                        model.bump();
                      },
                    }),
                    h('input', {
                      className: 'dsh-todo-field',
                      placeholder: tr('group'),
                      value: draft.group,
                      onChange: (event) => {
                        draft.group = event.target.value;
                        model.bump();
                      },
                    }),
                    h('input', {
                      className: 'dsh-todo-field',
                      placeholder: tr('parentUnit'),
                      value: draft.parentUnit,
                      onChange: (event) => {
                        draft.parentUnit = event.target.value;
                        model.bump();
                      },
                    }),
                  )
                : null,
              category.key === 'weekly'
                ? h(
                    'select',
                    {
                      className: 'dsh-todo-field',
                      value: draft.weeklyType,
                      onChange: (event) => {
                        draft.weeklyType = event.target.value;
                        model.bump();
                      },
                    },
                    h('option', { key: 'periodic', value: 'periodic' }, tr('catPeriodic')),
                    h('option', { key: 'temporary', value: 'temporary' }, tr('catTemporary')),
                  )
                : null,
              category.key === 'monthly'
                ? h('input', {
                    className: 'dsh-todo-field',
                    type: 'month',
                    value: draft.month,
                    onChange: (event) => {
                      draft.month = event.target.value;
                      model.bump();
                    },
                  })
                : null,
              !isProject && !isNote
                ? repeatSelect(draft.repeat, (event) => {
                    draft.repeat = event.target.value;
                    model.bump();
                  })
                : null,
              isNote
                ? repeatSelect(draft.repeat, (event) => {
                    draft.repeat = event.target.value;
                    model.bump();
                  })
                : null,
              draft.repeat === 'custom'
                ? customDayPicker(draft.customDays, (next) => {
                    draft.customDays = next;
                    model.bump();
                  })
                : null,
              h(
                'div',
                { className: 'dsh-todo-editor-actions' },
                h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-primary', onClick: () => model.saveCategory(category) }, tr('save')),
                h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeCategoryEditor() }, tr('cancel')),
              ),
            );
          };

          const renderProject = (project) => {
            const records = sortProblemRecordsNewestFirst(project.records.problem);
            return h(
              'div',
              { key: String(project.id), className: 'dsh-todo-project' },
              h(
                'div',
                { className: 'dsh-todo-project-head' },
                h(
                  'b',
                  { className: 'dsh-todo-project-name' },
                  project.name,
                  h('span', { className: 'dsh-todo-project-meta' }, '| ' + model.projectMeta(project)),
                ),
                h(
                  'span',
                  { className: 'dsh-todo-item-actions' },
                  h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.toggleProjectLog(project, 'problem') }, project.collapsed.problem ? tr('expandAll') : tr('collapseAll')),
                  h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.editProject(project) }, tr('edit')),
                  h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.deleteProject(project) }, tr('remove')),
                ),
              ),
              project.collapsed.problem
                ? null
                : h(
                    'div',
                    { className: 'dsh-todo-log' },
                    h(
                      'div',
                      { className: 'dsh-todo-log-head' },
                      h('h3', null, tr('problemLog')),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-todo-mini',
                          onClick: () => {
                            project.addingProblem = !project.addingProblem;
                            model.bump();
                          },
                        },
                        project.addingProblem ? tr('cancel') : '＋',
                      ),
                    ),
                    project.addingProblem
                      ? h(
                          'div',
                          { className: 'dsh-todo-inline-editor' },
                          h('textarea', {
                            className: 'dsh-todo-field',
                            rows: 2,
                            'data-autogrow': '1',
                            ref: autoGrowRef,
                            onInput: autoGrowInput,
                            placeholder: tr('recordPlaceholder'),
                            value: project.draft.problem,
                            onChange: (event) => {
                              project.draft.problem = event.target.value;
                              model.bump();
                            },
                          }),
                          h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.addRecord(project) }, tr('addRecord')),
                        )
                      : null,
                    h(
                      'div',
                      { className: 'dsh-todo-records' },
                      records.map((record) => {
                        const editing = model.editingRecord === record;
                        return h(
                          'div',
                          { key: String(record.id), className: 'dsh-todo-record' },
                          editing
                            ? h(
                                'div',
                                { className: 'dsh-todo-inline-editor' },
                                h(
                                  'div',
                                  { className: composing ? 'dsh-todo-record-editor dsh-todo-record-editor--composing' : 'dsh-todo-record-editor' },
                                  h(
                                    'div',
                                    { className: 'dsh-todo-record-mirror', 'aria-hidden': true },
                                    renderHighlightedText(model.editingRecordText, model.editingRecordHighlights),
                                  ),
                                  h('textarea', {
                                    className: 'dsh-todo-field dsh-todo-record-input',
                                    rows: 2,
                                    autoFocus: true,
                                    value: model.editingRecordText,
                                    ref: (element) => {
                                      recordInputRef.current = element;
                                      syncRecordInputHeight(element);
                                    },
                                    onChange: (event) => model.updateEditingRecordText(event.target.value),
                                    onCompositionStart: () => setComposing(true),
                                    onCompositionEnd: () => setComposing(false),
                                    onInput: (event) => syncRecordInputHeight(event.target),
                                    onMouseUp: (event) => openBarFromTextarea(event, record),
                                    onKeyUp: (event) => openBarFromTextarea(event, record),
                                    onContextMenu: (event) => {
                                      event.preventDefault();
                                      openBarFromTextarea(event, record);
                                    },
                                  }),
                                ),
                                h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.saveRecord(record) }, tr('save')),
                                h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.cancelRecordEdit() }, tr('cancel')),
                              )
                            : h(
                                React.Fragment,
                                null,
                                h(
                                  'div',
                                  { className: 'dsh-todo-record-meta' },
                                  h('small', null, record.createdAt),
                                  h(
                                    'span',
                                    { className: 'dsh-todo-item-actions' },
                                    h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.startRecordEdit(record) }, tr('edit')),
                                    h(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'dsh-todo-mini dsh-todo-record-delete',
                                        title: tr('deleteRecordTitle'),
                                        'aria-label': tr('deleteRecord'),
                                        onClick: () => model.requestDeleteRecord(project, record),
                                      },
                                      '🗑',
                                    ),
                                  ),
                                ),
                                h(
                                  'span',
                                  {
                                    className: 'dsh-todo-multiline dsh-todo-record-text',
                                    'data-record-id': String(record.id),
                                    onMouseUp: openBarFromViewSelection,
                                    onKeyUp: openBarFromViewSelection,
                                    onContextMenu: (event) => {
                                      event.preventDefault();
                                      openBarFromViewSelection(event);
                                    },
                                  },
                                  renderHighlightedText(record.text, record.highlights),
                                ),
                              ),
                        );
                      }),
                    ),
                  ),
            );
          };

          const renderLane = (category) => {
            const isProject = category.key === 'project';
            const items = isProject ? model.filteredProjects() : model.visibleCategoryItems(category);
            const fullscreen = model.fullscreenCategory === category.key;
            return h(
              'article',
              { key: category.key, className: fullscreen ? 'dsh-todo-lane dsh-todo-lane--fullscreen' : 'dsh-todo-lane' },
              h(
                'header',
                { className: 'dsh-todo-lane-head' },
                h(
                  'div',
                  { className: 'dsh-todo-lane-heading' },
                  h(
                    'strong',
                    null,
                    category.name,
                    category.key === 'weekly' ? ' · ' + tr('weekNumber') + model.currentWeekNumber() + '周' : null,
                  ),
                  category.key === 'weekly'
                    ? h('small', { className: 'dsh-todo-item-meta' }, tr('weekLegend'))
                    : null,
                  category.key === 'note'
                    ? h('input', {
                        className: 'dsh-todo-lane-search',
                        placeholder: tr('searchNotes'),
                        value: model.noteSearch,
                        onChange: (event) => {
                          model.noteSearch = event.target.value;
                          model.bump();
                        },
                      })
                    : null,
                  isProject
                    ? h('input', {
                        className: 'dsh-todo-lane-search',
                        placeholder: tr('searchProjects'),
                        value: model.projectSearch,
                        onChange: (event) => {
                          model.projectSearch = event.target.value;
                          model.bump();
                        },
                      })
                    : null,
                ),
                h(
                  'span',
                  { className: 'dsh-todo-lane-actions' },
                  category.key === 'monthly'
                    ? h(
                        React.Fragment,
                        null,
                        h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.setMonthlyCollapsed(category, false) }, tr('expandAll')),
                        h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.setMonthlyCollapsed(category, true) }, tr('collapseAll')),
                      )
                    : null,
                  isProject
                    ? h(
                        React.Fragment,
                        null,
                        h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.setProjectsCollapsed(false) }, tr('expandAll')),
                        h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.setProjectsCollapsed(true) }, tr('collapseAll')),
                        h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.toggleFullscreen(category.key) }, fullscreen ? tr('exitFullscreen') : tr('fullscreen')),
                      )
                    : null,
                  category.key === 'note'
                    ? h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.toggleFullscreen(category.key) }, fullscreen ? tr('exitFullscreen') : tr('fullscreen'))
                    : null,
                  h('button', { type: 'button', className: 'dsh-todo-mini', onClick: () => model.openCategoryEditor(category) }, '＋'),
                ),
              ),
              h(
                'div',
                { className: 'dsh-todo-lane-items' },
                model.categoryEditorKey === category.key ? renderCategoryEditor(category) : null,
                isProject
                  ? items.map(renderProject)
                  : items.map((item, index) => {
                      if (category.key === 'monthly' && model.isMonthlyItemCollapsed(item)) return null;
                      return renderItem(category, item, index);
                    }),
                !isProject && items.length === 0 ? h('p', { className: 'dsh-todo-empty' }, tr('empty')) : null,
              ),
            );
          };

          const categorySection = h(
            'section',
            { className: 'dsh-todo-panel' },
            h(
              'div',
              { className: 'dsh-todo-section-head' },
              h('div', null, h('h2', null, tr('categoryTitle')), h('span', { className: 'dsh-todo-muted' }, tr('categoryHint'))),
            ),
            h(
              'div',
              { className: 'dsh-todo-categories' },
              model.displayCategories().map(renderLane),
              h(
                'div',
                { className: 'dsh-todo-monthly-goal' },
                h('h2', null, tr('monthlyGoalTitle')),
                h('p', { className: 'dsh-todo-empty' }, tr('monthlyGoalEmpty')),
              ),
            ),
          );

          // ----- modals ------------------------------------------------------
          const taskModal = model.editingTask
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.closeTaskEditor(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('editTodo') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('editTodo')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.closeTaskEditor() }, '×'),
                  ),
                  h('textarea', {
                    className: 'dsh-todo-field',
                    rows: 3,
                    'data-autogrow': '1',
                    'data-edit-focus': '1',
                    ref: autoGrowRef,
                    onInput: autoGrowInput,
                    placeholder: tr('todoText'),
                    value: model.taskEditDraft.text,
                    onChange: (event) => {
                      model.taskEditDraft.text = event.target.value;
                      model.bump();
                    },
                  }),
                  categorySelect(model.taskEditDraft.category, (event) => {
                    model.taskEditDraft.category = event.target.value;
                    model.bump();
                  }),
                  repeatSelect(model.taskEditDraft.repeat, (event) => {
                    model.taskEditDraft.repeat = event.target.value;
                    model.bump();
                  }),
                  model.taskEditDraft.category === 'monthly'
                    ? h('input', {
                        className: 'dsh-todo-field',
                        type: 'month',
                        value: model.taskEditDraft.month,
                        onChange: (event) => {
                          model.taskEditDraft.month = event.target.value;
                          model.bump();
                        },
                      })
                    : null,
                  h('div', { className: 'dsh-todo-repeat-help' }, tr('repeatHelp')),
                  model.taskEditDraft.repeat === 'custom'
                    ? customDayPicker(model.taskEditDraft.customDays, (next) => {
                        model.taskEditDraft.customDays = next;
                        model.bump();
                      })
                    : null,
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-danger', onClick: () => model.deleteTask() }, tr('remove')),
                    h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-primary', onClick: () => model.saveTaskEdit() }, tr('save')),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeTaskEditor() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          const projectModal = model.editingProject
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.closeProjectEditor(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('editProject') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('editProject')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.closeProjectEditor() }, '×'),
                  ),
                  ['name', 'director', 'group', 'parentUnit'].map((field) =>
                    h('input', {
                      key: field,
                      className: 'dsh-todo-field',
                      placeholder: tr(field === 'name' ? 'projectName' : field),
                      value: model.projectEditDraft[field],
                      onChange: (event) => {
                        model.projectEditDraft[field] = event.target.value;
                        model.bump();
                      },
                    }),
                  ),
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-primary', onClick: () => model.saveProjectEdit() }, tr('save')),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeProjectEditor() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          const importModal = model.importOpen
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.closeImport(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('importTitle') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('importTitle')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.closeImport() }, '×'),
                  ),
                  h('p', { className: 'dsh-todo-muted' }, tr('importHint')),
                  model.importNotice ? h('p', { className: 'dsh-todo-warn' }, model.importNotice) : null,
                  h('textarea', {
                    className: 'dsh-todo-field',
                    rows: 8,
                    'data-autogrow': '1',
                    ref: autoGrowRef,
                    onInput: autoGrowInput,
                    placeholder: tr('importPlaceholder'),
                    value: model.importText,
                    onChange: (event) => {
                      model.importText = event.target.value;
                      model.bump();
                    },
                  }),
                  h(
                    'select',
                    {
                      className: 'dsh-todo-field',
                      value: model.importMode,
                      onChange: (event) => {
                        model.importMode = event.target.value;
                        model.bump();
                      },
                    },
                    h('option', { key: 'merge', value: 'merge' }, tr('importMerge')),
                    h('option', { key: 'replace', value: 'replace' }, tr('importReplace')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h('button', { type: 'button', className: 'dsh-todo-action dsh-todo-primary', onClick: () => model.applyImport() }, tr('importOk')),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeImport() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          const meetingModal = model.meetingOpen
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.closeMeeting(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('meetingTitle') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('meetingTitle')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.closeMeeting() }, '×'),
                  ),
                  h(
                    'div',
                    {
                      className: dropActive ? 'dsh-todo-dropzone dsh-todo-dropzone--active' : 'dsh-todo-dropzone',
                      role: 'button',
                      tabIndex: 0,
                      title: tr('meetingDropHint'),
                      'aria-label': tr('meetingDropHint'),
                      onClick: () => {
                        if (meetingFileInputRef.current && typeof meetingFileInputRef.current.click === 'function') {
                          meetingFileInputRef.current.click();
                        }
                      },
                      onDragOver: (event) => {
                        event.preventDefault();
                        if (!dropActive) setDropActive(true);
                      },
                      onDragLeave: () => {
                        if (dropActive) setDropActive(false);
                      },
                      onDrop: (event) => {
                        event.preventDefault();
                        if (dropActive) setDropActive(false);
                        model.handleMeetingDrop(event.dataTransfer && event.dataTransfer.files);
                      },
                    },
                    h('span', { className: 'dsh-todo-dropzone-plus', 'aria-hidden': true }, '+'),
                  ),
                  h('input', {
                    ref: (element) => {
                      meetingFileInputRef.current = element;
                    },
                    type: 'file',
                    accept: '.md,.txt',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (event) => {
                      const picker = event.target;
                      model.handleMeetingDrop(picker.files);
                      picker.value = '';
                    },
                  }),
                  model.meetingDropNotice ? h('p', { className: 'dsh-todo-muted' }, model.meetingDropNotice) : null,
                  h('input', {
                    className: 'dsh-todo-field',
                    placeholder: tr('meetingSubjectLabel'),
                    'aria-label': tr('meetingSubjectLabel'),
                    value: model.meetingSubject,
                    onChange: (event) => {
                      model.meetingSubject = event.target.value;
                      model.bump();
                    },
                  }),
                  h('input', {
                    className: 'dsh-todo-field',
                    type: 'date',
                    'aria-label': tr('meetingDateLabel'),
                    value: model.meetingDate,
                    onChange: (event) => {
                      model.meetingDate = event.target.value;
                      model.bump();
                    },
                  }),
                  h('textarea', {
                    className: 'dsh-todo-field dsh-todo-meeting-text',
                    rows: 10,
                    'data-autogrow': '1',
                    ref: autoGrowRef,
                    onInput: autoGrowInput,
                    placeholder: tr('meetingTranscriptLabel'),
                    'aria-label': tr('meetingTranscriptLabel'),
                    value: model.meetingTranscript,
                    onChange: (event) => {
                      model.meetingTranscript = event.target.value;
                      model.bump();
                    },
                  }),
                  model.meetingError ? h('p', { className: 'dsh-todo-warn' }, model.meetingError) : null,
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-todo-action dsh-todo-primary',
                        disabled: model.meetingSaving,
                        onClick: () => model.saveMeeting(),
                      },
                      model.meetingSaving ? tr('meetingSaving') : tr('meetingSave'),
                    ),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeMeeting() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          const maintenanceModal = model.maintenanceOpen
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.closeMaintenance(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('maintenanceTitle') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('maintenanceTitle')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.closeMaintenance() }, '×'),
                  ),
                  h('input', {
                    className: 'dsh-todo-field',
                    placeholder: tr('maintenanceSrc'),
                    'aria-label': tr('maintenanceSrc'),
                    value: model.maintenanceSrc,
                    onChange: (event) => {
                      model.maintenanceSrc = event.target.value;
                      model.bump();
                    },
                  }),
                  h('p', { className: 'dsh-todo-muted' }, tr('maintenanceKeepHint')),
                  h('input', {
                    className: 'dsh-todo-field',
                    placeholder: tr('maintenanceDest'),
                    'aria-label': tr('maintenanceDest'),
                    value: model.maintenanceDest,
                    onChange: (event) => {
                      model.maintenanceDest = event.target.value;
                      model.bump();
                    },
                  }),
                  h(
                    'label',
                    { className: 'dsh-todo-muted' },
                    h('input', {
                      type: 'checkbox',
                      checked: model.maintenanceOverwrite === true,
                      onChange: (event) => {
                        model.maintenanceOverwrite = event.target.checked === true;
                        model.bump();
                      },
                    }),
                    ' ',
                    tr('maintenanceOverwrite'),
                  ),
                  model.maintenanceError ? h('p', { className: 'dsh-todo-warn' }, model.maintenanceError) : null,
                  model.maintenanceResult ? h('p', { className: 'dsh-todo-muted dsh-todo-pre' }, model.maintenanceResult) : null,
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-todo-action dsh-todo-primary',
                        disabled: model.maintenanceBusy,
                        onClick: () => model.runMaintenance(),
                      },
                      model.maintenanceBusy ? tr('maintenanceRunning') : tr('maintenanceRun'),
                    ),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.closeMaintenance() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          const recordDeleteModal = model.recordDeleteTarget
            ? h(
                'div',
                { className: 'dsh-todo-modal-backdrop', onClick: (event) => { if (event.target === event.currentTarget) model.cancelDeleteRecord(); } },
                h(
                  'div',
                  { className: 'dsh-todo-modal', role: 'dialog', 'aria-modal': true, 'aria-label': tr('deleteRecordTitle') },
                  h(
                    'div',
                    { className: 'dsh-todo-modal-head' },
                    h('h3', null, tr('deleteRecordTitle')),
                    h('button', { type: 'button', className: 'dsh-todo-modal-close', 'aria-label': tr('cancel'), onClick: () => model.cancelDeleteRecord() }, '×'),
                  ),
                  h('p', { className: 'dsh-todo-muted' }, tr('deleteRecordHint')),
                  h(
                    'div',
                    { className: 'dsh-todo-record' },
                    h('div', { className: 'dsh-todo-record-meta' }, h('small', null, model.recordDeleteTarget.createdAt)),
                    h(
                      'span',
                      { className: 'dsh-todo-multiline dsh-todo-record-text' },
                      String(model.recordDeleteTarget.text || '').split(/\r?\n/)[0].slice(0, 160),
                    ),
                  ),
                  h('p', { className: 'dsh-todo-muted' }, model.recordDeleteTarget.projectName),
                  h(
                    'div',
                    { className: 'dsh-todo-editor-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-todo-action dsh-todo-primary',
                        disabled: model.recordDeleting,
                        onClick: () => model.confirmDeleteRecord(),
                      },
                      tr('deleteRecord'),
                    ),
                    h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.cancelDeleteRecord() }, tr('cancel')),
                  ),
                ),
              )
            : null;

          return h(
            React.Fragment,
            null,
            h('style', { key: 'todo-style' }, CSS),
            h(
              'div',
              { className: 'dsh-todo-root' },
              h(
                'header',
                { className: 'dsh-todo-head' },
                h(
                  'div',
                  { className: 'dsh-todo-heading' },
                  h('div', { className: 'dsh-todo-badge' }, h(TodoIcon, { size: 20, active: true })),
                  h(
                    'div',
                    null,
                    h('h1', { className: 'dsh-todo-title' }, tr('title')),
                    h('p', { className: 'dsh-todo-desc' }, tr('description')),
                  ),
                ),
                h(
                  'div',
                  { className: 'dsh-todo-head-actions' },
                  h('span', { className: 'dsh-todo-status' }, model.saving ? tr('savingLabel') : tr('saved')),
                  h(
                    'button',
                    { type: 'button', className: 'dsh-todo-btn', disabled: model.syncing, onClick: () => model.syncWorkbench() },
                    model.syncing ? tr('syncing') : tr('sync'),
                  ),
                  h('button', { type: 'button', className: 'dsh-todo-btn', onClick: () => model.openImport() }, tr('import')),
                  h('button', { type: 'button', className: 'dsh-todo-btn dsh-todo-btn--ghost', onClick: backToChat }, tr('backToChat')),
                ),
              ),
              h(
                'div',
                { className: 'dsh-todo-toolbar' },
                h('strong', null, model.weekLabel()),
                h(
                  'div',
                  { className: 'dsh-todo-segmented' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: model.mainView === 'period' ? 'active' : '',
                      onClick: () => {
                        model.mainView = 'period';
                        model.bump();
                      },
                    },
                    tr('periodView'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: model.mainView === 'category' ? 'active' : '',
                      onClick: () => {
                        model.mainView = 'category';
                        model.bump();
                      },
                    },
                    tr('categoryView'),
                  ),
                ),
                h('button', { type: 'button', className: 'dsh-todo-action', onClick: () => model.openMeeting() }, tr('meetingEntry')),
              ),
              model.mainView === 'period' ? periodSection : categorySection,
              model.storageBlocked ? h('p', { className: 'dsh-todo-warn' }, tr('storageBlocked')) : null,
              model.mergeNotice ? h('p', { className: 'dsh-todo-warn' }, model.mergeNotice) : null,
              model.meetingNotice ? h('p', { className: 'dsh-todo-muted' }, model.meetingNotice) : null,
              h(
                'div',
                { className: 'dsh-todo-maint' },
                h('button', { type: 'button', className: 'dsh-todo-maint-link', onClick: () => model.openMaintenance() }, tr('maintenanceEntry')),
              ),
              model.hostError ? h('p', { className: 'dsh-todo-warn' }, tr('hostError')) : null,
            ),
            taskModal,
            projectModal,
            importModal,
            meetingModal,
            maintenanceModal,
            recordDeleteModal,
            model.highlightBar
              ? h(
                  'div',
                  {
                    className: 'dsh-todo-hlbar',
                    style: { left: model.highlightBar.x + 'px', top: model.highlightBar.y + 'px' },
                    onMouseDown: (event) => event.preventDefault(),
                  },
                  h('button', { type: 'button', onMouseDown: (event) => event.preventDefault(), onClick: () => model.applyRecordHighlight() }, tr('hlApply')),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: !model.highlightBar.overlap,
                      onMouseDown: (event) => event.preventDefault(),
                      onClick: () => model.removeRecordHighlight(),
                    },
                    tr('hlRemove'),
                  ),
                  h('button', { type: 'button', onMouseDown: (event) => event.preventDefault(), onClick: () => model.clearRecordHighlights() }, tr('hlClear')),
                  h('button', { type: 'button', onMouseDown: (event) => event.preventDefault(), onClick: () => model.closeHighlightBar() }, tr('hlClose')),
                )
              : null,
            model.toast ? h('div', { className: 'dsh-todo-toast', role: 'status' }, model.toast) : null,
            h(
              'p',
              { className: 'dsh-todo-version' },
              'client ' + CLIENT_VERSION + ' · host ' + (model.hostVersion || '?') + ' · build ' + CLIENT_BUILD,
            ),
          );
        }

        // The sidebar entry: its id is also the `main` cell key the shell dispatches.
        // Order 4 keeps it above Sidebar Notes (order 5) in the same panel list.
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 4, label: () => tr('label') },
            TodoIcon,
          ),
        );
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, TodoPanel));
      },
    };
  },
});
