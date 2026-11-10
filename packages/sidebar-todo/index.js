/**
 * Host half of the Sidebar Todo bundle.
 *
 * The todo panel lives in the browser, but its document must outlive the page and be
 * read back by the panel on every mount. This half therefore:
 *   - persists the whole document as `state.json` in the plugin's data directory
 *     (default `<home>/.dsh/sidebar-todo`, override with `DSH_SIDEBAR_TODO_DIR`);
 *   - serves the same-origin JSON API the panel drives, through exact
 *     `/api/sidebarTodo.*` routes registered with `ctx.connection.fetch`;
 *   - offers a read-only `sync` operation that scans the local Chromium-family
 *     browser profiles for the workbench's own localStorage document
 *     (`ai-agent-web.todo.v1`) so the panel can import the existing todos.
 *
 * Nothing here writes to the workbench project: the sync scan only reads browser
 * storage files, and its result is handed to the panel, which keeps its own copy.
 */
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const PLUGIN_VERSION = '1.5.7'
/** Absolute registration paths of the panel API; each carries one operation. */
const API_BASE = '/api/sidebarTodo'
/** Panel document version, bumped when the todo shape changes. */
const DOCUMENT_VERSION = 1
const STATE_FILE = 'state.json'
const SEED_FILE = 'workbench-todos.json'
/** Host-written text bridge: only these roots/extensions are accepted. */
const HOST_COPY_ROOT = 'D:\\dsh'
const HOST_COPY_SRC_EXTENSIONS = ['.bin', '.txt', '.md', '.json', '.log']
const HOST_COPY_DEST_EXTENSIONS = ['.md', '.json', '.txt', '.log', '.bin']
const HOST_COPY_MAX_BYTES = 5 * 1024 * 1024
/** Append-only client crash log; entries are clipped so one bad crash cannot bloat it. */
const CLIENT_ERROR_LOG = 'D:\\dsh\\shared\\state\\client-errors.log'
const CLIENT_ERROR_MAX_BYTES = 2048
/** Diagnostic append-only log for meeting saves (detects duplicate/retried saves).
 *  Uses `.bin`: DLP does not encrypt that extension for DSH reads, so the log stays
 *  `read`-able even though several processes append to it. Rotated at 64KB. */
const MEETING_SAVE_LOG = 'D:\\dsh\\shared\\state\\save-meeting.bin'
const MEETING_SAVE_LOG_MAX_BYTES = Number(process.env.DSH_MEETING_SAVE_LOG_MAX || 64 * 1024)
const MEETING_SAVE_LOG_KEEP = 3
const MEETING_MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
/** Wake-session route guardrails. */
const WAKE_MAX_TEXT_BYTES = 16 * 1024
const WAKE_ALLOWED_ROOT = 'D:\\dsh'
/** The meeting specialist session woken after every successful transcript save. */
const MEETING_SPECIALIST = Object.freeze({
  sessionId: 'session-de1fc567-80a1-429e-9cd8-b38ed9150269',
  folder: 'conversations/20261104-会议专员',
})
const WAKE_MERGE_WINDOW_MS = 3000
const WAKE_MIN_INTERVAL_MS = 60000
let wakePendingPaths = []
let wakeTimer = null
let lastWakeAt = 0
/** Serialize transcript writes so a rapid batch cannot interleave/duplicate names. */
let meetingWriteChain = Promise.resolve()
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_TASKS = 5000
const MAX_PROJECTS = 2000
const MAX_SCAN_FILE_BYTES = 120 * 1024 * 1024
/** How many dated `state.json.bak-YYYY-MM-DD` copies to keep next to the document. */
const BACKUP_KEEP = 7
/** Fixed inbox for meeting transcripts; override with DSH_MEETING_INBOX_DIR. */
const MEETING_INBOX_DIR = 'D:\\dsh\\shared\\inbox\\meetings'
const MEETING_MAX_SUBJECT = 60
/** Agent-facing tool names: Host tools are global, so they carry the plugin prefix. */
const TOOL_READ = 'sidebar_todo_read'
const TOOL_MERGE = 'sidebar_todo_merge'
/** Subdirectory that holds the copies taken before a tool-driven write. */
const BACKUP_DIR = 'backups'
/** A panel that loaded or saved within this window may still hold a stale document. */
const PANEL_FRESH_MS = 30 * 60 * 1000
/** Timestamp of the latest panel load/save, used by the merge tool's overwrite warning. */
let lastPanelActivityAt = 0
/** Most recently served document, kept as the three-way merge base for panel saves. */
let lastServed = { rev: '', document: null }
/** Chromium-family user-data directories, relative to LOCALAPPDATA. */
const BROWSER_SUBDIRS = [
  ['Microsoft', 'Edge', 'User Data'],
  ['Google', 'Chrome', 'User Data'],
  ['BraveSoftware', 'Brave-Browser', 'User Data'],
  ['Vivaldi', 'User Data'],
]

export const inject = [
  'connection',
  'tools',
  'agents',
  'sessions',
  'sessionTitle',
  'workspaceController',
  'sessionController',
  'agentDefaultModel',
]

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function readBody(request) {
  return request
    .json()
    .then((value) => (value && typeof value === 'object' ? value : null))
    .catch(() => null)
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(status, message, details) {
  return json(Object.assign({ error: message }, details || {}), status)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Accept only the two arrays the panel owns. Task and project fields are
 * normalized again in the browser, so the Host keeps the payload but bounds it.
 */
/** Canonical problem-record order: newest first (id desc, createdAt tie-breaker). */
function sortProblemRecordsNewestFirst(list) {
  return list.slice().sort((left, right) => {
    const byId = (Number(right.id) || 0) - (Number(left.id) || 0)
    if (byId !== 0) return byId
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
  })
}

function normalizeDocument(value) {
  if (!isPlainObject(value)) return null
  if (!Array.isArray(value.tasks)) return null
  const tasks = value.tasks.filter(isPlainObject).slice(0, MAX_TASKS)
  const projects = Array.isArray(value.projects) ? value.projects.filter(isPlainObject).slice(0, MAX_PROJECTS) : []
  for (const project of projects) {
    const records = project.records && project.records.problem
    if (Array.isArray(records)) project.records.problem = sortProblemRecordsNewestFirst(records)
  }
  const importedAt = typeof value.importedAt === 'string' ? value.importedAt : ''
  return {
    version: DOCUMENT_VERSION,
    tasks,
    projects,
    importedAt,
    updatedAt: Date.now(),
  }
}

let cachedDirectory = null
async function resolveDirectory() {
  if (cachedDirectory) return cachedDirectory
  const override = process.env.DSH_SIDEBAR_TODO_DIR
  if (override && override.trim()) {
    cachedDirectory = path.resolve(override.trim())
    return cachedDirectory
  }
  cachedDirectory = path.join(os.homedir(), '.dsh', 'sidebar-todo')
  return cachedDirectory
}

async function ensureDirectory() {
  const directory = await resolveDirectory()
  await fsp.mkdir(directory, { recursive: true })
  return directory
}

async function writeFileAtomic(file, content) {
  const temporary = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  await fsp.writeFile(temporary, content, 'utf8')
  await fsp.rename(temporary, file)
}

async function readJsonFile(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

/**
 * Keep at most one dated copy of the previous document per calendar day, so an
 * automatic change (such as the weekly roll-over that rewrites `startDate`) can be
 * rolled back without losing a document that took effort to import.
 */
async function backupStateFile(directory) {
  const statePath = path.join(directory, STATE_FILE)
  let previous = null
  try {
    previous = await fsp.readFile(statePath, 'utf8')
  } catch (error) {
    return null
  }
  if (!previous || previous.trim().length === 0) return null
  // Local calendar day, so a backup taken just after midnight is not named yesterday.
  const stamp = new Date().toLocaleDateString('en-CA')
  const backupPath = path.join(directory, STATE_FILE + '.bak-' + stamp)
  try {
    const existing = await fsp.stat(backupPath)
    if (existing.isFile()) {
      // Keep retention honest even when today's copy already exists.
      await pruneBackups(directory)
      return backupPath
    }
  } catch (error) {
    /* no copy for this day yet */
  }
  await fsp.writeFile(backupPath, previous, 'utf8')
  await pruneBackups(directory)
  return backupPath
}

/** Drop the oldest dated copies beyond BACKUP_KEEP. */
async function pruneBackups(directory) {
  let entries = []
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true })
  } catch (error) {
    return
  }
  const prefix = STATE_FILE + '.bak-'
  const backups = entries
    .filter((entry) => entry.isFile() && entry.name.indexOf(prefix) === 0)
    .map((entry) => entry.name)
    .sort()
  for (const name of backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP))) {
    try {
      await fsp.unlink(path.join(directory, name))
    } catch (error) {
      /* a locked copy is retried on a later save */
    }
  }
}

/**
 * The workbench snapshot kept in the data directory (never in the package: the
 * package directory ships code only), if it holds any task.
 */
async function readSeedDocument(directory) {
  const value = await readJsonFile(path.join(directory, SEED_FILE))
  const document = normalizeDocument(value)
  if (!document || document.tasks.length === 0) return null
  return document
}

// ---------------------------------------------------------------------------
// Meeting inbox: write one transcript file under shared/inbox/meetings
// ---------------------------------------------------------------------------

/** A Windows-safe subject stem; falls back to a generic name. */
function sanitizeMeetingSubject(subject) {
  let name = String(subject || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  name = name.replace(/[. ]+$/g, '')
  if (!name || name === '.' || name === '..') return '会议'
  return name.length > MEETING_MAX_SUBJECT ? name.slice(0, MEETING_MAX_SUBJECT) : name
}

async function resolveMeetingInbox() {
  const override = process.env.DSH_MEETING_INBOX_DIR
  const directory = override && override.trim() ? path.resolve(override.trim()) : MEETING_INBOX_DIR
  await fsp.mkdir(directory, { recursive: true })
  return directory
}

/** Write the transcript (UTF-8, no BOM) and return its absolute path, adding -2/-3 on clashes. */
async function writeMeetingTranscript(subject, date, transcript) {
  const directory = await resolveMeetingInbox()
  const stamp = String(date || '').replace(/-/g, '')
  const cleanSubject = sanitizeMeetingSubject(subject)
  // Never append a second "逐字稿" when the subject already carries it.
  const stem = /逐字稿/.test(cleanSubject) ? cleanSubject : cleanSubject + '-逐字稿'
  const base = stamp + '-' + stem + '.md'
  let file = path.join(directory, base)
  for (let index = 2; index < 1000; index += 1) {
    let exists = false
    try {
      const stat = await fsp.stat(file)
      exists = stat.isFile()
    } catch (error) {
      exists = false
    }
    if (!exists) break
    file = path.join(directory, base.replace(/\.md$/, '-' + index + '.md'))
  }
  const normalized = String(transcript || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const content = normalized.endsWith('\n') ? normalized : normalized + '\n'
  await fsp.writeFile(file, content, 'utf8')
  return { file, bytes: Buffer.byteLength(content, 'utf8') }
}

/** Resolve a path only when it stays inside HOST_COPY_ROOT; null means refused. */
function hostCopyResolve(value) {
  const input = String(value || '').trim()
  if (!input) return null
  let resolved = null
  try {
    resolved = path.resolve(input)
  } catch (error) {
    return null
  }
  const root = path.resolve(HOST_COPY_ROOT)
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  const resolvedLower = resolved.toLowerCase()
  const rootLower = root.toLowerCase()
  const prefixLower = prefix.toLowerCase()
  if (resolvedLower !== rootLower && !resolvedLower.startsWith(prefixLower)) return null
  return resolved
}

// ---------------------------------------------------------------------------
// Read-only workbench sync: find `ai-agent-web.todo.v1` in a browser profile
// ---------------------------------------------------------------------------

/** Walk back from an anchor to the smallest enclosing JSON object that parses. */
function findEnclosingObject(text, anchor) {
  let tries = 0
  for (let start = text.lastIndexOf('{', anchor); start >= 0 && tries < 40; start = text.lastIndexOf('{', start - 1)) {
    tries += 1
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
      } else if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          const candidate = text.slice(start, index + 1)
          if (!candidate.includes('"tasks"')) break
          try {
            const value = JSON.parse(candidate)
            if (isPlainObject(value) && Array.isArray(value.tasks)) return value
          } catch (error) {
            /* keep walking outwards */
          }
          break
        }
      }
    }
  }
  return null
}

/** Decode one LevelDB file and pull the workbench todo document out of it. */
function extractDocumentFromBuffer(buffer) {
  const texts = [buffer.toString('utf16le'), buffer.toString('latin1')]
  for (const text of texts) {
    let anchor = text.indexOf('"tasks"')
    let guard = 0
    while (anchor >= 0 && guard < 8) {
      guard += 1
      const value = findEnclosingObject(text, anchor)
      if (value) {
        const document = normalizeDocument(value)
        if (document && document.tasks.length > 0) return document
      }
      anchor = text.indexOf('"tasks"', anchor + 7)
    }
  }
  return null
}

async function listProfileDirectories(userDataDirectory) {
  let entries = []
  try {
    entries = await fsp.readdir(userDataDirectory, { withFileTypes: true })
  } catch (error) {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^(Default|Profile \d+|Guest Profile)$/.test(entry.name))
    .map((entry) => path.join(userDataDirectory, entry.name))
}

async function scanWorkbenchSnapshot() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const scanned = []
  const locked = []
  const candidates = []
  for (const parts of BROWSER_SUBDIRS) {
    const userDataDirectory = path.join(localAppData, ...parts)
    for (const profileDirectory of await listProfileDirectories(userDataDirectory)) {
      const leveldb = path.join(profileDirectory, 'Local Storage', 'leveldb')
      let files = []
      try {
        files = await fsp.readdir(leveldb)
      } catch (error) {
        continue
      }
      for (const name of files) {
        const file = path.join(leveldb, name)
        let size = 0
        try {
          size = (await fsp.stat(file)).size
        } catch (error) {
          continue
        }
        if (size === 0 || size > MAX_SCAN_FILE_BYTES) continue
        scanned.push(file)
        let buffer = null
        try {
          buffer = await fsp.readFile(file)
        } catch (error) {
          locked.push(file)
          continue
        }
        const document = extractDocumentFromBuffer(buffer)
        if (document) candidates.push({ file, document })
      }
    }
  }
  candidates.sort((left, right) => right.document.tasks.length - left.document.tasks.length)
  const best = candidates.length > 0 ? candidates[0] : null
  return {
    document: best ? best.document : null,
    source: best ? best.file : '',
    scanned: scanned.length,
    locked: locked.length,
    candidates: candidates.length,
  }
}

// ---------------------------------------------------------------------------
// Handoff probe: verify the Host session APIs used by the future "one-word
// handoff" automation. EXPLORATION ONLY — never touches a real session.
// ---------------------------------------------------------------------------

const PROBE_TITLE_PREFIX = 'TEST-'
const PROBE_CWD = 'D:\\dsh'
/** One-shot probe: run at plugin load unless the marker exists; result is Host-written JSON. */
const PROBE_ONCE_MARKER = 'D:\\dsh\\shared\\state\\handoff-probe.once'
const PROBE_RESULT_FILE = 'D:\\dsh\\shared\\state\\handoff-probe-result.json'
/** Set by `apply(ctx)`; the probe handler and tool resolve services through it. */
let pluginCtx = null

function probeError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** Current default provider/model selection, tolerant of a missing service. */
function probeDefaultSelection(ctx) {
  try {
    const model = ctx.get('agentDefaultModel')
    if (model && typeof model.currentSelection === 'function') {
      const selection = model.currentSelection()
      if (selection && selection.provider && selection.model) {
        const options = { provider: selection.provider, model: selection.model }
        if (selection.reasoningEffort) options.reasoningEffort = selection.reasoningEffort
        return options
      }
    }
  } catch (error) {
    /* optional service */
  }
  return {}
}

/**
 * Create a `TEST-` session, rename it, optionally archive+restore it, then release
 * the agent. Every input-derived value is prefixed with `TEST-`; archive only ever
 * targets the session this call just created.
 */
async function runHandoffProbe(ctx, input) {
  const report = { steps: [] }
  const step = (name, data) => {
    report.steps.push(Object.assign({ name }, data))
  }
  if (!ctx) {
    return { ok: false, error: { code: 'NO_CONTEXT', message: '探针没有 Host context（插件未 apply）', stack: '' }, steps: report.steps }
  }
  const rawTitle = String((input && input.title) || 'probe').trim() || 'probe'
  const wantedTitle = PROBE_TITLE_PREFIX + rawTitle
  const archive = Boolean(input && input.archive === true)
  const requestedCwd = String((input && input.cwd) || '').trim() || PROBE_CWD
  const cwd = path.isAbsolute(requestedCwd) ? requestedCwd : PROBE_CWD
  let handle = null
  let sessionId = ''
  try {
    const agents = ctx.get('agents')
    if (!agents || typeof agents.create !== 'function') {
      throw probeError('SERVICE_MISSING', 'ctx.agents.create 不可用')
    }
    const sessions = ctx.get('sessions')
    const sessionTitle = ctx.get('sessionTitle')
    const workspaceController = ctx.get('workspaceController')
    const selection = probeDefaultSelection(ctx)
    sessionId = 'session-probe-' + Date.now().toString(36)
    step('services', {
      ok: true,
      agents: true,
      sessions: Boolean(sessions),
      sessionTitle: Boolean(sessionTitle && typeof sessionTitle.rename === 'function'),
      workspaceController: Boolean(workspaceController && typeof workspaceController.archiveSession === 'function'),
      selection,
    })
    handle = await agents.create({
      sessionId,
      meta: { cwd },
      agentOptions: selection,
    })
    sessionId = String(handle.agent.id)
    step('create', {
      ok: true,
      sessionId,
      signature: 'ctx.agents.create({ sessionId, meta: { cwd }, agentOptions: { provider, model } })',
      cwd,
    })
    const session = sessions && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined
    step('sessions.get', { ok: Boolean(session) })
    let initialTitle = ''
    if (sessionTitle && session && typeof sessionTitle.rename === 'function') {
      const first = sessionTitle.rename(session, wantedTitle)
      initialTitle = String((first && first.title) || '')
      step('rename.initial', { ok: initialTitle === wantedTitle, title: initialTitle })
    } else {
      step('rename.initial', { ok: false, reason: 'sessionTitle.rename 不可用（或 session 未取到）' })
    }
    // Same-title probe (T-008 d): a SECOND session renamed to the very same title as the
    // first one. This decides whether a handoff may create the successor before archiving.
    let sameTitle = null
    if (input && input.sameTitleTest === true) {
      let secondHandle = null
      const secondId = sessionId + '-same'
      try {
        secondHandle = await agents.create({ sessionId: secondId, meta: { cwd }, agentOptions: selection })
        const secondSessionId = String(secondHandle.agent.id)
        step('create.second', { ok: true, sessionId: secondSessionId })
        if (sessionTitle && sessions && typeof sessionTitle.rename === 'function' && typeof sessions.get === 'function') {
          const secondSession = sessions.get(secondSessionId)
          try {
            const snapshot = sessionTitle.rename(secondSession, wantedTitle)
            sameTitle = { ok: true, title: String((snapshot && snapshot.title) || ''), note: '同标题改名成功 → 允许重复标题' }
          } catch (error) {
            sameTitle = {
              ok: false,
              code: (error && error.code) || 'TITLE_CONFLICT',
              message: String((error && error.message) || error),
              note: '同标题改名失败',
            }
          }
          step('rename.sameTitle', sameTitle)
        } else {
          sameTitle = { ok: false, code: 'SERVICE_MISSING', message: 'sessionTitle/sessions 不可用' }
          step('rename.sameTitle', sameTitle)
        }
        if (workspaceController && typeof workspaceController.archiveSession === 'function') {
          const value2 = await workspaceController.archiveSession({ sessionId: secondSessionId, stopActivity: true })
          const archived2 = Boolean(
            value2 && Array.isArray(value2.archivedSessionIds) && value2.archivedSessionIds.indexOf(secondSessionId) >= 0,
          )
          step('archive.second', { ok: archived2, archivedSessionIds: (value2 && value2.archivedSessionIds) || [] })
          sameTitle = Object.assign({ sessionId: secondSessionId, archived: archived2 }, sameTitle || {})
        }
      } catch (error) {
        sameTitle = {
          ok: false,
          code: (error && error.code) || 'SECOND_CREATE_FAILED',
          message: String((error && error.message) || error),
        }
        step('create.second', { ok: false, message: sameTitle.message })
      } finally {
        try {
          if (secondHandle && typeof secondHandle.dispose === 'function') await secondHandle.dispose()
        } catch (disposeError) {
          /* best effort */
        }
      }
    }
    // Collision probe: creating a second agent with the SAME session id must fail with
    // a structured code (title uniqueness is NOT enforced by rename, so id is the real key).
    let collision = null
    try {
      const duplicate = await agents.create({ sessionId, meta: { cwd }, agentOptions: selection })
      collision = { ok: true, note: '重复 sessionId 竟然创建成功', sessionId: duplicate && duplicate.agent && duplicate.agent.id }
      try {
        if (duplicate && typeof duplicate.dispose === 'function') await duplicate.dispose()
      } catch (disposeError) {
        /* best effort */
      }
    } catch (error) {
      collision = { ok: false, code: (error && error.code) || 'CREATE_CONFLICT', message: String((error && error.message) || error) }
    }
    step('collision.duplicateId', collision)
    let renamedTitle = ''
    if (sessionTitle && session && typeof sessionTitle.rename === 'function') {
      const snapshot = sessionTitle.rename(session, wantedTitle + '-改名')
      renamedTitle = String((snapshot && snapshot.title) || '')
      step('rename', {
        ok: renamedTitle.indexOf(PROBE_TITLE_PREFIX) === 0,
        title: renamedTitle,
        signature: 'ctx.sessionTitle.rename(session, title)',
      })
    } else {
      step('rename', { ok: false, reason: 'sessionTitle.rename 不可用（或 session 未取到）' })
    }
    const currentTitle = renamedTitle || wantedTitle
    let archived = false
    let unarchived = false
    let finalState = 'unknown'
    if (archive) {
      if (!workspaceController || typeof workspaceController.archiveSession !== 'function') {
        step('archive', { ok: false, reason: 'workspaceController.archiveSession 不可用' })
      } else if (currentTitle.indexOf(PROBE_TITLE_PREFIX) !== 0) {
        step('archive', { ok: false, reason: '标题不是 TEST- 前缀，拒绝归档' })
      } else {
        const value = await workspaceController.archiveSession({ sessionId, stopActivity: true })
        archived = Boolean(value && Array.isArray(value.archivedSessionIds) && value.archivedSessionIds.indexOf(sessionId) >= 0)
        step('archive', {
          ok: archived,
          signature: 'ctx.workspaceController.archiveSession({ sessionId, stopActivity: true })',
          archivedSessionIds: (value && value.archivedSessionIds) || [],
        })
        const back = await workspaceController.unarchiveSession({ sessionId })
        unarchived = Boolean(back && Array.isArray(back.archivedSessionIds) && back.archivedSessionIds.indexOf(sessionId) < 0)
        step('unarchive', {
          ok: unarchived,
          signature: 'ctx.workspaceController.unarchiveSession({ sessionId })',
          archivedSessionIds: (back && back.archivedSessionIds) || [],
        })
        // Leave the probe session archived so the user only has to clean one archived row.
        const finalValue = await workspaceController.archiveSession({ sessionId, stopActivity: true })
        const finalArchived = Boolean(
          finalValue && Array.isArray(finalValue.archivedSessionIds) && finalValue.archivedSessionIds.indexOf(sessionId) >= 0,
        )
        finalState = finalArchived ? 'archived' : 'unarchived'
        step('archive.final', {
          ok: finalArchived,
          archivedSessionIds: (finalValue && finalValue.archivedSessionIds) || [],
        })
      }
    }
    let disposed = false
    try {
      await handle.dispose()
      disposed = true
      step('dispose', { ok: true, detail: 'agent 已释放；持久化 session log 保留（无删除 API）' })
    } catch (error) {
      step('dispose', { ok: false, message: String((error && error.message) || error) })
    }
    return {
      ok: true,
      sessionId,
      title: wantedTitle,
      initialTitle: initialTitle || '',
      renamedTitle: renamedTitle || '',
      archived,
      unarchived,
      finalState,
      collision,
      sameTitle,
      disposed,
      cwd,
      note: '测试会话以 TEST- 前缀创建；最终状态为 archived；agent 已释放；session log 持久化保留，无法通过 API 删除。',
      steps: report.steps,
    }
  } catch (error) {
    try {
      if (handle && typeof handle.dispose === 'function') await handle.dispose()
    } catch (disposeError) {
      /* best effort */
    }
    return {
      ok: false,
      sessionId,
      error: {
        code: (error && error.code) || 'PROBE_FAILED',
        message: String((error && error.message) || error),
        stack: String((error && error.stack) || ''),
      },
      steps: report.steps,
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Run the probe once at plugin load and persist the JSON result for later inspection. */
async function runHandoffProbeOnce(ctx) {
  const target = process.env.DSH_PROBE_RESULT || PROBE_RESULT_FILE
  try {
    let markerExists = false
    try {
      const markerStat = await fsp.stat(PROBE_ONCE_MARKER)
      markerExists = markerStat.isFile()
    } catch (error) {
      markerExists = false
    }
    if (markerExists) return
    await fsp.mkdir(path.dirname(PROBE_ONCE_MARKER), { recursive: true })
    await fsp.writeFile(PROBE_ONCE_MARKER, new Date().toISOString(), 'utf8')
    const result = await runHandoffProbe(ctx, { title: 'handoff-probe', archive: true, sameTitleTest: true, auto: true })
    await fsp.writeFile(target, JSON.stringify({ at: new Date().toISOString(), auto: true, result }, null, 2), 'utf8')
  } catch (error) {
    try {
      await fsp.writeFile(
        target,
        JSON.stringify({ at: new Date().toISOString(), auto: true, error: { message: String((error && error.message) || error), stack: String((error && error.stack) || '') } }, null, 2),
        'utf8',
      )
    } catch (writeError) {
      /* last resort: nothing else to do */
    }
  }
}

/** Rotate the save log once it exceeds the cap; keep the newest N dated copies. */
async function rotateMeetingSaveLog(target) {
  try {
    let stat = null
    try {
      stat = await fsp.stat(target)
    } catch (error) {
      return
    }
    if (!stat || !stat.isFile() || stat.size <= MEETING_SAVE_LOG_MAX_BYTES) return
    const directory = path.dirname(target)
    const base = path.basename(target).replace(/\.bin$/i, '')
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    let rotated = path.join(directory, base + '-' + stamp + '.bin')
    for (let index = 2; index < 100; index += 1) {
      try {
        const existing = await fsp.stat(rotated)
        if (!existing.isFile()) break
      } catch (error) {
        break
      }
      rotated = path.join(directory, base + '-' + stamp + '-' + index + '.bin')
    }
    await fsp.rename(target, rotated)
    const names = (await fsp.readdir(directory))
      .filter((name) => name.indexOf(base + '-') === 0 && /\.bin$/i.test(name))
      .map((name) => path.join(directory, name))
      .sort()
    while (names.length > MEETING_SAVE_LOG_KEEP) {
      const oldest = names.shift()
      try {
        await fsp.unlink(oldest)
      } catch (error) {
        /* rotation is best effort */
      }
    }
  } catch (error) {
    /* rotation is best effort */
  }
}

/** Best-effort diagnostic log for every meeting save attempt (duplicate detection). */
async function appendMeetingSaveLog(entry) {
  try {
    const target = process.env.DSH_MEETING_SAVE_LOG || MEETING_SAVE_LOG
    if (!hostCopyResolve(target)) return
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await rotateMeetingSaveLog(target)
    await fsp.appendFile(target, JSON.stringify(entry) + '\n', 'utf8')
  } catch (error) {
    /* diagnostics only */
  }
}

/** Only the real inbox may wake the meeting specialist (tests point the inbox at Temp). */
function meetingInboxIsReal() {
  const configured = process.env.DSH_MEETING_INBOX_DIR
  const realPath = process.env.DSH_MEETING_REAL_INBOX || MEETING_INBOX_DIR
  const actual = configured && configured.trim() ? path.resolve(configured.trim()) : path.resolve(MEETING_INBOX_DIR)
  return actual.toLowerCase() === path.resolve(realPath).toLowerCase()
}

/** Prompt body telling the meeting specialist exactly which transcripts just landed. */
function buildMeetingWakeText(files) {
  const lines = files.map((file) => '- ' + path.basename(file) + '：' + file).join('\n')
  return (
    '【收件箱新稿】刚保存 ' +
    files.length +
    ' 份逐字稿：\n' +
    lines +
    '\n请按流程处理（自检→纪要→长期库→摘要→推送），完成后移入 processed。'
  )
}

/**
 * Debounce a wake: within 3s all saved paths go into ONE prompt; at most one wake
 * per 60s. Returns whether this save scheduled/joined a wake (throttle/skip = false).
 */
function scheduleMeetingWake(filePath) {
  if (!meetingInboxIsReal()) return { woken: false, reason: 'wake:skip' }
  if (lastWakeAt > 0 && Date.now() - lastWakeAt < WAKE_MIN_INTERVAL_MS) {
    return { woken: false, reason: 'wake:throttled' }
  }
  wakePendingPaths.push(filePath)
  if (!wakeTimer) {
    wakeTimer = setTimeout(() => {
      wakeTimer = null
      flushMeetingWake().catch(() => undefined)
    }, WAKE_MERGE_WINDOW_MS)
    if (wakeTimer && typeof wakeTimer.unref === 'function') wakeTimer.unref()
  }
  return { woken: true, reason: 'wake:scheduled' }
}

/** Deliver the merged wake prompt; never throws (save success must not depend on it). */
async function flushMeetingWake() {
  const files = wakePendingPaths.splice(0)
  if (files.length === 0) return
  const at = new Date().toISOString()
  const sessionId = process.env.DSH_MEETING_SPECIALIST_ID || MEETING_SPECIALIST.sessionId
  try {
    const ctx = pluginCtx
    const controller = ctx && typeof ctx.get === 'function' ? ctx.get('sessionController') : undefined
    if (!controller || typeof controller.prompt !== 'function') {
      await appendMeetingSaveLog({ at, wake: 'error:SERVICE_MISSING', sessionId, files: files.length })
      return
    }
    const inspection = typeof controller.inspect === 'function' ? await controller.inspect(sessionId) : null
    const cwd = inspection && inspection.meta && inspection.meta.cwd ? String(inspection.meta.cwd) : WAKE_ALLOWED_ROOT
    if (!hostCopyResolve(cwd)) {
      await appendMeetingSaveLog({ at, wake: 'skip:cwd-not-allowed', sessionId, cwd, files: files.length })
      return
    }
    const text = buildMeetingWakeText(files)
    const requestId = 'wake-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    const value = await controller.prompt(
      {
        requestId,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: 'Asia/Shanghai',
      },
      new AbortController().signal,
    )
    lastWakeAt = Date.now()
    await appendMeetingSaveLog({
      at,
      wake: 'ok',
      sessionId,
      delivered: Boolean(value && value.accepted === true),
      files: files.length,
      bytes: Buffer.byteLength(text, 'utf8'),
      paths: files,
    })
  } catch (error) {
    await appendMeetingSaveLog({
      at,
      wake: 'error:' + String((error && error.code) || 'WAKE_FAILED'),
      sessionId,
      files: files.length,
      message: String((error && error.message) || error),
    })
  }
}

// ---------------------------------------------------------------------------
// Handoff tools: create a successor session, archive/unarchive it, wake it.
// Shared by the Host tools and the handoff probe.
// ---------------------------------------------------------------------------

function handoffError(code, message, extra) {
  return Object.assign({ ok: false, error: { code, message } }, extra || {})
}

function sessionIdIsValid(value) {
  return /^session-[A-Za-z0-9._-]{6,}$/.test(String(value || '').trim())
}

function sessionPathAllowed(cwd) {
  return Boolean(hostCopyResolve(String(cwd || '').trim() || WAKE_ALLOWED_ROOT))
}

function newSessionId() {
  return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/** Deliver one text prompt to an existing session (shared by the route and the tool). */
async function deliverSessionPrompt(ctx, sessionId, text, mode) {
  if (!ctx || typeof ctx.get !== 'function') return handoffError('NO_CONTEXT', '插件未 apply')
  if (!sessionIdIsValid(sessionId)) return handoffError('BAD_REQUEST', 'sessionId 非法：' + sessionId)
  const value = String(text || '')
  if (!value.trim()) return handoffError('BAD_REQUEST', 'text 不能为空')
  if (Buffer.byteLength(value, 'utf8') > WAKE_MAX_TEXT_BYTES) return handoffError('TEXT_TOO_LARGE', 'text 超过 16KB')
  const controller = ctx.get('sessionController')
  if (!controller || typeof controller.prompt !== 'function') {
    return handoffError('SERVICE_MISSING', 'ctx.sessionController.prompt 不可用（检查插件 inject）')
  }
  if (typeof controller.inspect === 'function') {
    let cwd = ''
    try {
      const inspection = await controller.inspect(sessionId)
      cwd = inspection && inspection.meta && inspection.meta.cwd ? String(inspection.meta.cwd) : ''
    } catch (error) {
      return handoffError('SESSION_NOT_FOUND', '会话不存在或不可读：' + sessionId + '（' + String((error && error.message) || error) + '）')
    }
    if (!sessionPathAllowed(cwd)) return handoffError('PATH_OUTSIDE', '仅允许 D:\\dsh 下的会话：' + cwd)
  }
  try {
    const requestId = 'wake-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    // `prompt(request, signal)` requires the AbortSignal argument (admission cancellation).
    const result = await controller.prompt(
      {
        requestId,
        sessionId,
        mode: mode === 'steer' ? 'steer' : 'queue',
        content: [{ type: 'text', text: value }],
        clientTimeZone: 'Asia/Shanghai',
      },
      new AbortController().signal,
    )
    return { ok: true, delivered: Boolean(result && result.accepted === true), sessionId, mode: mode === 'steer' ? 'steer' : 'queue', requestId }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error && error.isDSHRemoteError ? String(error.code) : 'WAKE_FAILED',
        message: String((error && error.message) || error),
        stack: String((error && error.stack) || ''),
      },
    }
  }
}

/** Create a live session with a chosen title (no prompt, no inherited history). */
async function createHandoffSession(ctx, input) {
  if (!ctx || typeof ctx.get !== 'function') return handoffError('NO_CONTEXT', '插件未 apply')
  const title = String((input && input.title) || '').trim()
  if (!title) return handoffError('TITLE_REQUIRED', 'title 不能为空')
  if (title.length > 60) return handoffError('TITLE_TOO_LONG', 'title 超过 60 字：' + title.length)
  const cwdInput = String((input && input.cwd) || '').trim() || WAKE_ALLOWED_ROOT
  const cwd = hostCopyResolve(cwdInput)
  if (!cwd) return handoffError('PATH_OUTSIDE', 'cwd 必须在 ' + WAKE_ALLOWED_ROOT + ' 下：' + cwdInput)
  const sessionController = ctx.get('sessionController')
  const preset = String((input && input.preset) || '')
  // Preferred path: sessionController.create + rename (no live Session/agents needed).
  if (sessionController && typeof sessionController.create === 'function' && typeof sessionController.rename === 'function') {
    try {
      const created = await sessionController.create(Object.assign({ cwd }, preset ? { agentPreset: preset } : {}))
      const createdId = String((created && created.sessionId) || '')
      if (!createdId) return handoffError('CREATE_FAILED', 'sessionController.create 未返回 sessionId')
      const renamed = await sessionController.rename({ sessionId: createdId, title })
      return {
        ok: true,
        sessionId: createdId,
        title: String((renamed && renamed.title) || title),
        cwd,
        preset,
        api: 'sessionController.create+rename',
        note: '会话已创建并命名；未 prompt、未继承历史；会话文件夹由脚本创建，不由本工具创建。',
      }
    } catch (error) {
      return handoffError((error && error.code) || 'CREATE_FAILED', String((error && error.message) || error), {
        stack: String((error && error.stack) || ''),
      })
    }
  }
  // Fallback: agents.create + sessions.get + sessionTitle.rename.
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const sessionTitle = ctx.get('sessionTitle')
  if (!agents || typeof agents.create !== 'function') return handoffError('SERVICE_MISSING', 'ctx.agents.create 不可用（检查插件 inject）')
  if (!sessions || typeof sessions.get !== 'function') return handoffError('SERVICE_MISSING', 'ctx.sessions 不可用（检查插件 inject）')
  if (!sessionTitle || typeof sessionTitle.rename !== 'function') return handoffError('SERVICE_MISSING', 'ctx.sessionTitle.rename 不可用（检查插件 inject）')
  const selection = probeDefaultSelection(ctx)
  const sessionId = newSessionId()
  try {
    const handle = await agents.create({
      sessionId,
      meta: Object.assign({ cwd }, preset ? { agentPreset: preset } : {}),
      agentOptions: selection,
    })
    const actualId = String((handle && handle.agent && handle.agent.id) || sessionId)
    const session = sessions.get(actualId)
    if (!session) {
      return handoffError('SESSION_NOT_REGISTERED', '创建后取不到 live session：' + actualId, { sessionId: actualId })
    }
    const snapshot = sessionTitle.rename(session, title)
    const finalTitle = String((snapshot && snapshot.title) || title)
    return {
      ok: true,
      sessionId: actualId,
      title: finalTitle,
      cwd,
      preset,
      api: 'agents.create+rename',
      note: '会话已创建并命名；agent 保持运行（未 prompt、未继承历史）；会话文件夹由脚本创建，不由本工具创建。',
    }
  } catch (error) {
    return handoffError((error && error.code) || 'CREATE_FAILED', String((error && error.message) || error), {
      stack: String((error && error.stack) || ''),
      sessionId,
    })
  }
}

/** Archive (or unarchive) one session; refuses archiving the calling session itself. */
async function archiveHandoffSession(ctx, input) {
  if (!ctx || typeof ctx.get !== 'function') return handoffError('NO_CONTEXT', '插件未 apply')
  const sessionId = String((input && input.sessionId) || '').trim()
  if (!sessionIdIsValid(sessionId)) return handoffError('BAD_REQUEST', 'sessionId 非法：' + sessionId)
  const archived = !(input && input.archived === false)
  const controller = ctx.get('workspaceController')
  if (!controller || typeof controller.archiveSession !== 'function') {
    return handoffError('SERVICE_MISSING', 'ctx.workspaceController.archiveSession 不可用（检查插件 inject）')
  }
  const agents = ctx.get('agents')
  let initiatorId = ''
  try {
    const initiator = agents && typeof agents.currentInitiator === 'function' ? agents.currentInitiator() : null
    if (initiator && initiator.id) initiatorId = String(initiator.id)
  } catch (error) {
    initiatorId = ''
  }
  if (initiatorId && initiatorId === sessionId) {
    return handoffError('SELF_ARCHIVE_REFUSED', '禁止归档调用者自身会话：' + sessionId)
  }
  const sessionController = ctx.get('sessionController')
  if (sessionController && typeof sessionController.inspect === 'function') {
    let cwd = ''
    try {
      const inspection = await sessionController.inspect(sessionId)
      cwd = inspection && inspection.meta && inspection.meta.cwd ? String(inspection.meta.cwd) : ''
    } catch (error) {
      return handoffError('SESSION_NOT_FOUND', '会话不存在或不可读：' + sessionId + '（' + String((error && error.message) || error) + '）')
    }
    if (!sessionPathAllowed(cwd)) return handoffError('PATH_OUTSIDE', '仅允许 D:\\dsh 下的会话：' + cwd)
  }
  try {
    const value = archived
      ? await controller.archiveSession({ sessionId, stopActivity: true })
      : await controller.unarchiveSession({ sessionId })
    const archivedSessionIds = (value && Array.isArray(value.archivedSessionIds)) ? value.archivedSessionIds : []
    return { ok: true, archived: archivedSessionIds.indexOf(sessionId) >= 0, archivedSessionIds, sessionId }
  } catch (error) {
    return handoffError((error && error.isDSHRemoteError ? String(error.code) : 'ARCHIVE_FAILED'), String((error && error.message) || error), {
      stack: String((error && error.stack) || ''),
      sessionId,
    })
  }
}

const handlers = {
  async handoffProbe(request) {
    const body = await readBody(request)
    if (!isPlainObject(body)) {
      return json({ ok: false, error: { code: 'BAD_REQUEST', message: '请求体必须是对象：{ title, cwd?, archive? }' } }, 400)
    }
    const result = await runHandoffProbe(pluginCtx, body)
    return json(result, result.ok ? 200 : 500)
  },

  /**
   * Wake one session by admitting a text prompt, same effect as `send_to_session`.
   * Guardrails: session cwd must live under D:\dsh, text only (≤16KB), queue by default.
   */
  async wakeSession(request) {
    const body = await readBody(request)
    if (!isPlainObject(body)) {
      return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'body 必须是 { sessionId, text, mode? }' } }, 400)
    }
    const result = await deliverSessionPrompt(pluginCtx, String(body.sessionId || '').trim(), String(body.text || ''), body.mode)
    if (result.ok) return json(result)
    const code = result.error && result.error.code
    const status = code === 'TEXT_TOO_LARGE' ? 413 : code === 'PATH_OUTSIDE' ? 403 : code === 'BAD_REQUEST' ? 400 : 500
    return json(result, status)
  },

  /** Delete one project problem record (panel path). recordId is the primary key. */
  async deleteProblemRecord(request) {
    const body = await readBody(request)
    if (!isPlainObject(body)) return fail(400, '请求缺少删除参数')
    const projectId = body.projectId !== undefined && body.projectId !== null ? String(body.projectId) : ''
    const projectName = String(body.projectName || '').trim()
    const recordId = body.recordId !== undefined && body.recordId !== null ? String(body.recordId) : ''
    const text = body.text !== undefined ? String(body.text) : ''
    if (!projectId && !projectName) return fail(400, '需要 projectId 或 projectName')
    if (!recordId && !text) return fail(400, '需要 recordId（优先）或 text')
    try {
      const directory = await ensureDirectory()
      const { document } = await readTodoDocumentFromDisk()
      const next = JSON.parse(JSON.stringify(document))
      let project = projectId ? next.projects.find((candidate) => String(candidate.id) === projectId) : null
      if (!project && projectName) {
        project =
          next.projects.find((candidate) => String(candidate.name) === projectName) ||
          next.projects.find((candidate) => String(candidate.name).indexOf(projectName) >= 0)
      }
      if (!project) return json({ ok: false, error: { code: 'PROJECT_NOT_FOUND', message: '找不到项目：' + (projectName || projectId) } }, 404)
      const problemList = project.records && Array.isArray(project.records.problem) ? project.records.problem : []
      let problemIndex = recordId ? problemList.findIndex((record) => String(record.id) === recordId) : -1
      if (problemIndex < 0 && !recordId && text) {
        problemIndex = problemList.findIndex((record) => String(record.text || '').trim() === text.trim())
      }
      if (problemIndex < 0) {
        return json({ ok: false, error: { code: 'NOT_FOUND', message: '记录不存在：recordId=' + (recordId || '(空)') } }, 404)
      }
      if (text && String(problemList[problemIndex].text || '').trim() !== text.trim()) {
        return json({ ok: false, error: { code: 'TEXT_MISMATCH', message: '记录内容与 text 不一致，拒绝删除（请先 read 确认）' } }, 409)
      }
      const removed = problemList.splice(problemIndex, 1)[0]
      const normalized = normalizeDocument(next)
      if (!normalized) return fail(500, '删除后文档不合法，已放弃写入')
      const backupPath = await backupForTool(directory)
      await writeFileAtomic(path.join(directory, STATE_FILE), JSON.stringify(normalized, null, 2))
      lastPanelActivityAt = 0
      return json({
        ok: true,
        removed: { id: removed.id, createdAt: removed.createdAt, text: oneLine(removed.text, 120) },
        projectId: project.id,
        projectName: project.name,
        counts: { tasks: (normalized.tasks || []).length, projects: (normalized.projects || []).length },
        rev: documentRev(normalized),
        backupPath,
      })
    } catch (error) {
      return fail(500, '删除问题记录失败：' + messageOf(error))
    }
  },

  async load() {
    try {
      lastPanelActivityAt = Date.now()
      const directory = await ensureDirectory()
      const stored = await readJsonFile(path.join(directory, STATE_FILE))
      const document = normalizeDocument(stored)
      const seed = document ? null : await readSeedDocument(directory)
      const served = document || emptyTodoDocument()
      const rev = documentRev(served)
      lastServed = { rev, document: JSON.parse(JSON.stringify(served)) }
      return json({ version: PLUGIN_VERSION, directory, document, seed, rev })
    } catch (error) {
      return fail(500, '读取侧栏待办失败：' + messageOf(error))
    }
  },

  async save(request) {
    lastPanelActivityAt = Date.now()
    const body = await readBody(request)
    if (!body || !isPlainObject(body.document)) {
      return fail(400, '请求缺少数值：document')
    }
    const incoming = normalizeDocument(body.document)
    if (!incoming) return fail(400, '待办文档为空或格式不正确')
    try {
      const directory = await ensureDirectory()
      const stored = normalizeDocument(await readJsonFile(path.join(directory, STATE_FILE)))
      const disk = stored || emptyTodoDocument()
      const diskRev = documentRev(disk)
      let merged = incoming
      let conflicts = []
      let mergedFlag = false
      if (diskRev !== documentRev(incoming)) {
        const baseRev = typeof body.baseRev === 'string' ? body.baseRev : ''
        const base = baseRev && lastServed.rev === baseRev && lastServed.document ? lastServed.document : null
        const result = mergeDocumentsSafely(base, disk, incoming)
        merged = result.document
        conflicts = result.conflicts
        mergedFlag = true
      }
      const serialized = JSON.stringify(merged, null, 2)
      if (serialized.length > MAX_DOCUMENT_BYTES) return fail(413, '待办文档过大，已拒绝保存')
      const backup = await backupStateFile(directory)
      await writeFileAtomic(path.join(directory, STATE_FILE), serialized)
      const rev = documentRev(merged)
      lastServed = { rev, document: JSON.parse(JSON.stringify(merged)) }
      return json({
        version: PLUGIN_VERSION,
        directory,
        document: merged,
        backup,
        rev,
        merged: mergedFlag,
        conflicts: mergedFlag ? conflicts : [],
        warning: mergedFlag ? 'a newer document was on disk and has been merged; refresh the panel to see it' : '',
      })
    } catch (error) {
      return fail(500, '保存侧栏待办失败：' + messageOf(error))
    }
  },

  async saveMeeting(request) {
    const body = await readBody(request)
    if (!isPlainObject(body)) return fail(400, '请求缺少会议纪要内容')
    const subject = String(body.subject || '').trim()
    const date = String(body.date || '').trim() || localDateKey(new Date())
    const transcript = String(body.transcript || '')
    if (!subject) return fail(400, '会议主题不能为空')
    if (!transcript.trim()) return fail(400, '逐字稿不能为空')
    const transcriptBytes = Buffer.byteLength(transcript, 'utf8')
    if (transcriptBytes > MEETING_MAX_TRANSCRIPT_BYTES) {
      await appendMeetingSaveLog({
        at: new Date().toISOString(),
        ok: false,
        subject,
        date,
        bytes: transcriptBytes,
        message: '逐字稿超过 2MB',
      })
      return fail(413, '逐字稿超过 2MB：' + transcriptBytes)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, '会议日期需为 yyyy-MM-dd：' + date)
    try {
      const written = await (meetingWriteChain = meetingWriteChain.then(
        () => writeMeetingTranscript(subject, date, transcript),
        () => writeMeetingTranscript(subject, date, transcript),
      ))
      const scheduled = scheduleMeetingWake(written.file)
      await appendMeetingSaveLog({
        at: new Date().toISOString(),
        ok: true,
        subject,
        date,
        bytes: written.bytes,
        path: written.file,
        woken: scheduled.woken,
        wakeNote: scheduled.reason,
      })
      return json({ ok: true, path: written.file, bytes: written.bytes, date, subject, woken: scheduled.woken })
    } catch (error) {
      await appendMeetingSaveLog({ at: new Date().toISOString(), ok: false, subject, date, bytes: transcriptBytes, message: String((error && error.message) || error) })
      return fail(500, '保存会议纪要失败：' + messageOf(error))
    }
  },

  /**
   * Host-written text bridge: read a plain `.bin`/`.txt` under D:\dsh and let the
   * Host write it as `.md`/`.json`/`.txt`/`.log`, so DSH can read the result
   * (files written by non-Host processes get DLP-encrypted for DSH).
   */
  async hostCopyText(request) {
    const body = await readBody(request)
    const reject = (status, code, message) => json({ ok: false, error: { code, message } }, status)
    if (!isPlainObject(body)) return reject(400, 'PATH_OUTSIDE', '请求缺少 src/dest')
    const src = hostCopyResolve(body.src)
    if (!src) return reject(400, 'PATH_OUTSIDE', 'src 必须位于 ' + HOST_COPY_ROOT + ' 下：' + String(body.src || ''))
    const dest = hostCopyResolve(body.dest)
    if (!dest) return reject(400, 'PATH_OUTSIDE', 'dest 必须位于 ' + HOST_COPY_ROOT + ' 下：' + String(body.dest || ''))
    if (src.toLowerCase() === dest.toLowerCase()) return reject(400, 'PATH_REFUSED', 'src 与 dest 不能是同一个文件')
    const srcExt = path.extname(src).toLowerCase()
    if (HOST_COPY_SRC_EXTENSIONS.indexOf(srcExt) < 0) {
      return reject(400, 'PATH_REFUSED', 'src 只接受 ' + HOST_COPY_SRC_EXTENSIONS.join('/'))
    }
    const destExt = path.extname(dest).toLowerCase()
    if (HOST_COPY_DEST_EXTENSIONS.indexOf(destExt) < 0) {
      return reject(400, 'PATH_REFUSED', 'dest 只接受 ' + HOST_COPY_DEST_EXTENSIONS.join('/'))
    }
    let srcStat = null
    try {
      srcStat = await fsp.stat(src)
    } catch (error) {
      return reject(404, 'SRC_MISSING', '源文件不存在：' + src)
    }
    if (!srcStat.isFile()) return reject(400, 'SRC_MISSING', '源路径不是文件：' + src)
    if (srcStat.size > HOST_COPY_MAX_BYTES) return reject(413, 'SRC_TOO_LARGE', '源文件超过 5MB：' + srcStat.size)
    let destExists = false
    try {
      const destStat = await fsp.stat(dest)
      destExists = destStat.isFile()
    } catch (error) {
      destExists = false
    }
    if (destExists && body.overwrite !== true) {
      return reject(409, 'DEST_EXISTS', '目标已存在，需 overwrite=true 才覆盖：' + dest)
    }
    try {
      const raw = await fsp.readFile(src)
      // Copy bytes as-is (byte-identical round trips); only strip an input BOM so the
      // written text stays BOM-free. The source file itself is never modified.
      let buffer = raw
      if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        buffer = raw.subarray(3)
      }
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      await fsp.writeFile(dest, buffer)
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      return json({ ok: true, src, dest, bytes: buffer.length, sha256, srcPreserved: true })
    } catch (error) {
      return reject(500, 'IO_ERROR', messageOf(error))
    }
  },

  /**
   * Append one client-side crash/rejection record to the host log, so a future crash
   * leaves a trace (`D:\dsh\shared\state\client-errors.log`). Append only; each entry
   * is clipped to 2KB; the target path is fixed inside D:\dsh.
   */
  async appendLog(request) {
    const body = await readBody(request)
    const reject = (status, code, message) => json({ ok: false, error: { code, message } }, status)
    if (!isPlainObject(body)) return reject(400, 'LOG_REQUIRED', '缺少日志内容')
    const message = String(body.message || '').trim()
    if (!message) return reject(400, 'LOG_REQUIRED', '日志 message 不能为空')
    const stack = String(body.stack || '')
    const context = String(body.context || '')
    const level = String(body.level || 'error')
    const at = String(body.at || new Date().toISOString())
    const entryText =
      '[' + at + '] [' + level + ']' + (context ? ' [' + context + ']' : '') + ' ' + message + (stack ? '\n' + stack : '') + '\n'
    let entry = Buffer.from(entryText, 'utf8').subarray(0, CLIENT_ERROR_MAX_BYTES).toString('utf8')
    if (!entry.endsWith('\n')) entry += '\n'
    try {
      const target = process.env.DSH_CLIENT_ERROR_LOG || CLIENT_ERROR_LOG
      if (!hostCopyResolve(target)) return reject(400, 'PATH_OUTSIDE', '日志路径必须在 ' + HOST_COPY_ROOT + ' 下')
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.appendFile(target, entry, 'utf8')
      return json({ ok: true, file: target, bytes: Buffer.byteLength(entry, 'utf8') })
    } catch (error) {
      return reject(500, 'IO_ERROR', messageOf(error))
    }
  },

  async sync() {
    try {
      const result = await scanWorkbenchSnapshot()
      if (!result.document) {
        return fail(
          404,
          result.locked > 0
            ? '没读到工作台数据：有浏览器正在运行并锁定了本地存储文件，先关掉浏览器再同步，或手动粘贴数据导入。'
            : '没在已安装的浏览器里找到工作台待办数据（ai-agent-web.todo.v1），请用打开工作台的那个浏览器再试一次，或手动粘贴数据导入。',
          { scanned: result.scanned, locked: result.locked, candidates: 0 },
        )
      }
      return json({
        version: PLUGIN_VERSION,
        document: result.document,
        source: result.source,
        scanned: result.scanned,
        locked: result.locked,
        candidates: result.candidates,
      })
    } catch (error) {
      return fail(500, '同步工作台待办失败：' + messageOf(error))
    }
  },
}

// ---------------------------------------------------------------------------
// Agent tools: read / merge the todo document through the Host
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function localDateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

function parseDateKey(key) {
  const parts = String(key || '').split('-').map(Number)
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1)
}

function addDaysValue(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfWeekValue(date) {
  const next = new Date(date)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

function weekdayNameValue(date) {
  return WEEKDAY_NAMES[date.getDay() === 0 ? 6 : date.getDay() - 1]
}

function timeTextValue(date) {
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
}

/** Whether a task occurs on one date, using the same rule as the panel. */
function isTaskOnDateValue(task, dateKey) {
  const startKey = String(task.startDate || '')
  if (!startKey || dateKey < startKey) return false
  if (!task.repeat) return dateKey === startKey
  const start = parseDateKey(startKey)
  const current = parseDateKey(dateKey)
  if (task.repeat === 'daily') return true
  if (task.repeat === 'weekly') return current.getDay() === start.getDay()
  if (task.repeat === 'monthly') return current.getDate() === start.getDate()
  if (task.repeat === 'custom') return (task.customDays || []).indexOf(weekdayNameValue(current)) >= 0
  return false
}

function isOccurrenceDoneValue(task, dateKey) {
  const completed = task.completedDates || {}
  return Boolean(completed[dateKey])
}

function isUnfinishedValue(task) {
  if (task.done) return false
  const completed = task.completedDates || {}
  return !Object.keys(completed).some((key) => completed[key])
}

function isWeeklyVisibleValue(task) {
  return ['monthly', 'project', 'note'].indexOf(task.category) < 0
}

function emptyTodoDocument() {
  return { version: DOCUMENT_VERSION, tasks: [], projects: [], importedAt: '', updatedAt: Date.now() }
}

async function readTodoDocumentFromDisk() {
  const directory = await ensureDirectory()
  const stored = await readJsonFile(path.join(directory, STATE_FILE))
  return { directory, document: normalizeDocument(stored) || emptyTodoDocument() }
}

function summarizeTaskValue(task) {
  const carriedFrom = task.carriedFrom === null || task.carriedFrom === undefined ? null : task.carriedFrom
  return {
    id: task.id,
    text: task.text || '',
    category: task.category || '',
    repeat: task.repeat || '',
    customDays: Array.isArray(task.customDays) ? task.customDays : [],
    startDate: task.startDate || '',
    month: task.month || '',
    done: Boolean(task.done),
    carriedFrom,
    carriedFromDate: task.carriedFromDate || '',
    carriedTo: task.carriedTo || '',
  }
}

function summarizeProjectValue(project) {
  const problems = project.records && Array.isArray(project.records.problem) ? project.records.problem : []
  return {
    id: project.id,
    name: project.name || '',
    director: project.director || '',
    group: project.group || '',
    parentUnit: project.parentUnit || '',
    problemCount: problems.length,
    problems: problems.map((record) => ({ createdAt: record.createdAt || '', text: record.text || '' })),
  }
}

/** Build the filtered view one tool read returns; never mutates the document. */
function collectTodoView(document, scope, anchorKey) {
  const counts = { tasks: document.tasks.length, projects: document.projects.length }
  if (scope === 'projects') {
    return { scope, label: '项目工作', window: null, tasks: [], leftovers: [], monthlyGoals: [], projects: document.projects.map(summarizeProjectValue), notes: [], counts }
  }
  if (scope === 'notes') {
    const notes = document.tasks
      .filter((task) => task.category === 'note')
      .slice()
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .map(summarizeTaskValue)
    return { scope, label: '随手记', window: null, tasks: [], leftovers: [], monthlyGoals: [], projects: [], notes, counts }
  }
  if (scope === 'all') {
    return {
      scope,
      label: '全部',
      window: null,
      tasks: document.tasks.map(summarizeTaskValue),
      leftovers: [],
      monthlyGoals: [],
      projects: document.projects.map((project) => Object.assign(summarizeProjectValue(project), { problems: [] })),
      notes: [],
      counts,
    }
  }
  const anchorDate = parseDateKey(anchorKey)
  let from = anchorKey
  let to = anchorKey
  let label = '今天 ' + anchorKey
  if (scope === 'week') {
    const monday = startOfWeekValue(anchorDate)
    from = localDateKey(monday)
    to = localDateKey(addDaysValue(monday, 6))
    label = '本周 ' + from + ' ~ ' + to
  } else if (scope === 'month') {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
    const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0)
    from = localDateKey(first)
    to = localDateKey(last)
    label = first.getFullYear() + '年' + (first.getMonth() + 1) + '月'
  } else {
    label = '今天 ' + anchorKey
  }
  const entries = []
  let cursor = parseDateKey(from)
  const end = parseDateKey(to)
  while (cursor <= end) {
    const key = localDateKey(cursor)
    for (const task of document.tasks) {
      if (!isWeeklyVisibleValue(task)) continue
      if (!isTaskOnDateValue(task, key)) continue
      entries.push(Object.assign(summarizeTaskValue(task), {
        date: key,
        weekday: weekdayNameValue(cursor),
        occurrenceDone: isOccurrenceDoneValue(task, key),
      }))
    }
    cursor = addDaysValue(cursor, 1)
  }
  const leftovers = document.tasks
    .filter((task) => isWeeklyVisibleValue(task) && !task.repeat && String(task.startDate || '') < from && isUnfinishedValue(task))
    .map((task) => Object.assign(summarizeTaskValue(task), { reason: '截至 ' + from + ' 仍未完成' }))
  const monthlyGoals = scope === 'month'
    ? document.tasks
        .filter((task) => task.category === 'monthly' && (task.month || String(task.startDate || '').slice(0, 7)) === from.slice(0, 7))
        .map(summarizeTaskValue)
    : []
  return { scope, label, window: { from, to }, tasks: entries, leftovers, monthlyGoals, projects: [], notes: [], counts }
}

function oneLine(text, max) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

function formatTodoViewMarkdown(view) {
  const lines = ['# 侧栏待办 · ' + view.label, '', '任务 ' + view.counts.tasks + ' 条 / 项目 ' + view.counts.projects + ' 个']
  if (view.tasks.length > 0) {
    lines.push('', '## 待办（' + view.tasks.length + '）')
    for (const task of view.tasks) {
      const box = task.occurrenceDone ? '[x]' : '[ ]'
      const meta = []
      if (task.date) meta.push(task.date + ' ' + task.weekday)
      if (task.category) meta.push(task.category)
      if (task.carriedFrom !== null) meta.push('上周带到本周')
      if (task.repeat) meta.push('重复:' + task.repeat)
      lines.push('- ' + box + ' ' + oneLine(task.text, 120) + (meta.length > 0 ? '  · ' + meta.join(' · ') : ''))
    }
  }
  if (view.leftovers.length > 0) {
    lines.push('', '## 以前未完成（' + view.leftovers.length + '）')
    for (const task of view.leftovers) {
      lines.push('- [ ] ' + oneLine(task.text, 120) + '  · ' + task.startDate + ' 起未完成' + (task.category ? ' · ' + task.category : ''))
    }
  }
  if (view.monthlyGoals.length > 0) {
    lines.push('', '## 月目标（' + view.monthlyGoals.length + '）')
    for (const task of view.monthlyGoals) {
      lines.push('- [ ] ' + oneLine(task.text, 120) + '  · ' + (task.month || task.startDate))
    }
  }
  if (view.projects.length > 0) {
    lines.push('', '## 项目（' + view.projects.length + '）')
    for (const project of view.projects) {
      const meta = [project.director || '未填总监', project.group || '未填集团', project.parentUnit || '未填上级']
      const head = '- ' + project.name + '（' + meta.join(' | ') + '）'
      const problemCount = project.problemCount !== undefined ? project.problemCount : project.problems.length
      lines.push(head + ' · 问题记录 ' + problemCount + ' 条')
      if (Array.isArray(project.problems) && project.problems.length > 0) {
        lines.push('  - 最近：' + oneLine(project.problems[0].text, 100) + '（' + project.problems[0].createdAt + '）')
      }
    }
  }
  if (view.notes.length > 0) {
    lines.push('', '## 随手记（' + view.notes.length + '）')
    for (const note of view.notes) {
      lines.push('- ' + oneLine(note.text, 120) + '  · ' + (note.startDate || ''))
    }
  }
  if (view.tasks.length + view.leftovers.length + view.monthlyGoals.length + view.projects.length + view.notes.length === 0) {
    lines.push('', '（该范围内没有内容）')
  }
  return lines.join('\n')
}

/** Copy the current document into `backups/`, never overwriting an earlier copy. */
async function backupForTool(directory) {
  const statePath = path.join(directory, STATE_FILE)
  let previous = null
  try {
    previous = await fsp.readFile(statePath, 'utf8')
  } catch (error) {
    return ''
  }
  if (!previous || previous.trim().length === 0) return ''
  const backupDirectory = path.join(directory, BACKUP_DIR)
  await fsp.mkdir(backupDirectory, { recursive: true })
  const stamp = new Date().toLocaleDateString('en-CA')
  const base = path.join(backupDirectory, STATE_FILE + '.bak-' + stamp)
  let file = base
  for (let index = 2; index < 1000; index += 1) {
    let exists = false
    try {
      const stat = await fsp.stat(file)
      exists = stat.isFile()
    } catch (error) {
      exists = false
    }
    if (!exists) break
    file = base + '-' + index
  }
  await fsp.writeFile(file, previous, 'utf8')
  return file
}

function nextTaskIdValue(document) {
  let max = 0
  for (const task of document.tasks) max = Math.max(max, Number(task.id) || 0)
  return max + 1
}

function nextRecordIdValue(document) {
  let max = 0
  for (const project of document.projects) {
    const problems = project.records && Array.isArray(project.records.problem) ? project.records.problem : []
    for (const record of problems) max = Math.max(max, Number(record.id) || 0)
  }
  return max + 1
}

function findTaskValue(document, id) {
  const wanted = Number(id)
  return document.tasks.find((task) => Number(task.id) === wanted)
}

/** Apply the model-facing merge ops; throws with a readable reason on bad input. */
function applyMergeOps(document, ops) {
  const applied = []
  let nextTaskId = nextTaskIdValue(document)
  let nextRecordId = nextRecordIdValue(document)
  for (const raw of ops) {
    if (!isPlainObject(raw)) throw new Error('每个 op 必须是对象')
    const kind = String(raw.op || '')
    if (kind === 'add-task' || kind === 'add-note') {
      const text = String(raw.text || '').trim()
      if (!text) throw new Error(kind + ' 需要非空 text')
      const isNote = kind === 'add-note'
      const startDate = String(raw.startDate || localDateKey(new Date()))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('startDate 需为 yyyy-MM-dd：' + startDate)
      const task = {
        id: nextTaskId++,
        text,
        category: isNote ? 'note' : String(raw.category || ''),
        repeat: String(raw.repeat || ''),
        customDays: Array.isArray(raw.customDays) ? raw.customDays.map(String) : [],
        startDate,
        createdAt: new Date().toISOString(),
        month: String(raw.month || ''),
        done: false,
        completedDates: {},
        carriedTo: '',
        carriedFrom: null,
        carriedFromDate: '',
      }
      if (task.category === 'monthly' && !/^\d{4}-\d{2}$/.test(task.month)) task.month = startDate.slice(0, 7)
      document.tasks.push(task)
      applied.push(kind + ' #' + task.id + ' ' + oneLine(text, 40))
    } else if (kind === 'add-project-problem') {
      const projectName = String(raw.projectName || '').trim()
      const text = String(raw.text || '').trim()
      if (!projectName || !text) throw new Error('add-project-problem 需要 projectName 和 text')
      const exact = document.projects.find((project) => String(project.name) === projectName)
      const project = exact || document.projects.find((candidate) => String(candidate.name).indexOf(projectName) >= 0)
      if (!project) {
        throw new Error('找不到项目：' + projectName + '；现有项目：' + document.projects.map((candidate) => candidate.name).join('、'))
      }
      project.records = project.records || { problem: [] }
      if (!Array.isArray(project.records.problem)) project.records.problem = []
      project.records.problem.unshift({ id: nextRecordId++, createdAt: timeTextValue(new Date()), text })
      applied.push('add-project-problem ' + project.name + ' ' + oneLine(text, 40))
    } else if (kind === 'delete-project-problem') {
      const projectId = raw.projectId !== undefined && raw.projectId !== null ? String(raw.projectId) : ''
      const projectName = String(raw.projectName || '').trim()
      const recordId = raw.recordId !== undefined && raw.recordId !== null ? String(raw.recordId) : ''
      const text = raw.text !== undefined ? String(raw.text) : ''
      if (!projectId && !projectName) throw new Error('delete-project-problem 需要 projectId 或 projectName')
      if (!recordId && !text) throw new Error('delete-project-problem 需要 recordId（优先）或 text')
      let project = projectId ? document.projects.find((candidate) => String(candidate.id) === projectId) : null
      if (!project && projectName) {
        project =
          document.projects.find((candidate) => String(candidate.name) === projectName) ||
          document.projects.find((candidate) => String(candidate.name).indexOf(projectName) >= 0)
      }
      if (!project) throw new Error('PROJECT_NOT_FOUND: 找不到项目 ' + (projectName || projectId))
      const problemList = project.records && Array.isArray(project.records.problem) ? project.records.problem : []
      let problemIndex = recordId ? problemList.findIndex((record) => String(record.id) === recordId) : -1
      if (problemIndex < 0 && !recordId && text) {
        problemIndex = problemList.findIndex((record) => String(record.text || '').trim() === text.trim())
      }
      if (problemIndex < 0) {
        throw new Error('NOT_FOUND: 记录不存在 project=' + project.name + ' recordId=' + (recordId || '(空)'))
      }
      if (text && String(problemList[problemIndex].text || '').trim() !== text.trim()) {
        throw new Error('TEXT_MISMATCH: 记录内容与 text 不一致，拒绝删除（请先 read 确认）')
      }
      const removedProblem = problemList.splice(problemIndex, 1)[0]
      applied.push('delete-project-problem ' + project.name + ' #' + removedProblem.id + ' ' + oneLine(removedProblem.text, 40))
    } else if (kind === 'set-done') {
      const task = findTaskValue(document, raw.id)
      if (!task) throw new Error('找不到任务 id=' + raw.id)
      const dateKey = String(raw.date || task.startDate || localDateKey(new Date()))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('date 需为 yyyy-MM-dd：' + dateKey)
      task.completedDates = task.completedDates && typeof task.completedDates === 'object' ? task.completedDates : {}
      task.completedDates[dateKey] = raw.done === true
      task.done = raw.done === true
      applied.push('set-done #' + task.id + ' ' + dateKey + '=' + String(task.done))
    } else if (kind === 'update-task') {
      const task = findTaskValue(document, raw.id)
      if (!task) throw new Error('找不到任务 id=' + raw.id)
      const changed = []
      for (const field of ['text', 'category', 'repeat', 'startDate', 'month']) {
        if (raw[field] === undefined) continue
        task[field] = String(raw[field])
        changed.push(field)
      }
      if (Array.isArray(raw.customDays)) {
        task.customDays = raw.customDays.map(String)
        changed.push('customDays')
      }
      if (changed.length === 0) throw new Error('update-task #' + raw.id + ' 没有可更新字段')
      applied.push('update-task #' + task.id + ' ' + changed.join('/'))
    } else if (kind === 'delete-task') {
      const task = findTaskValue(document, raw.id)
      if (!task) throw new Error('找不到任务 id=' + raw.id)
      if (String(task.category || '') !== 'note') {
        throw new Error('delete-task 仅允许删除随手记（category=note）；任务 #' + task.id + ' 的分类是 "' + (task.category || '无') + '"，请在面板里人工处理')
      }
      if (raw.text !== undefined && String(raw.text) !== String(task.text)) {
        throw new Error('delete-task 的 text 与任务内容不一致，拒绝删除（请先 read 确认）')
      }
      const index = document.tasks.indexOf(task)
      if (index >= 0) document.tasks.splice(index, 1)
      applied.push('delete-task #' + task.id + ' ' + oneLine(task.text, 40))
    } else {
      throw new Error('不支持的 op：' + (kind || '(空)') + '（支持 add-task / add-note / add-project-problem / delete-project-problem / set-done / update-task / delete-task）')
    }
  }
  const normalized = normalizeDocument(document)
  if (!normalized) throw new Error('合并后的文档不合法，已放弃写入')
  return { document: normalized, applied }
}

// --- save-time merge: a stale panel must never drop writes made by tools ---------------

/** Content revision of the persisted document; stable across reads of the same content. */
function documentRev(document) {
  const payload = JSON.stringify({ tasks: document.tasks || [], projects: document.projects || [] })
  return createHash('sha1').update(payload).digest('hex').slice(0, 16)
}

function mapById(list) {
  const map = new Map()
  for (const item of list || []) map.set(String(item.id), item)
  return map
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sortById(list) {
  return list.slice().sort((left, right) => (Number(left.id) || 0) - (Number(right.id) || 0))
}

function unionProblemRecords(clientProject, diskProject) {
  const map = new Map()
  for (const record of (diskProject.records && diskProject.records.problem) || []) map.set(String(record.id), record)
  for (const record of (clientProject.records && clientProject.records.problem) || []) map.set(String(record.id), record)
  return sortProblemRecordsNewestFirst(Array.from(map.values()))
}

function mergeProjects(baseList, diskList, clientList) {
  const baseMap = mapById(baseList)
  const diskMap = mapById(diskList)
  const clientMap = mapById(clientList)
  const projects = []
  const conflicts = []
  for (const id of new Set([...clientMap.keys(), ...diskMap.keys(), ...baseMap.keys()])) {
    const baseProject = baseMap.get(id)
    const diskProject = diskMap.get(id)
    const clientProject = clientMap.get(id)
    if (clientProject && diskProject) {
      if (sameJson(clientProject, diskProject)) projects.push(clientProject)
      else if (!baseProject) {
        projects.push(clientProject)
        conflicts.push('project:' + id)
      } else if (sameJson(baseProject, clientProject)) projects.push(diskProject)
      else if (sameJson(baseProject, diskProject)) projects.push(clientProject)
      else {
        const merged = JSON.parse(JSON.stringify(clientProject))
        merged.records = merged.records || {}
        merged.records.problem = unionProblemRecords(clientProject, diskProject)
        projects.push(merged)
        conflicts.push('project:' + id)
      }
    } else if (clientProject && !diskProject) {
      if (!baseProject) projects.push(clientProject)
      else if (sameJson(baseProject, clientProject)) {
        /* removed on disk */
      } else {
        projects.push(clientProject)
        conflicts.push('project:' + id)
      }
    } else if (!clientProject && diskProject) {
      if (!baseProject) projects.push(diskProject)
      else if (!sameJson(baseProject, diskProject)) {
        projects.push(diskProject)
        conflicts.push('project:' + id)
      }
      /* else: the panel deleted it and the disk still matches the base -> honour the delete */
    }
  }
  return { projects: sortById(projects), conflicts }
}

/**
 * Field-level merge for one task changed on both sides: keep the panel's own fields
 * (text/category/...), but never lose a completion recorded by another writer.
 * A `true` completion always wins over `false`, and `done` is the logical OR.
 */
function mergeTaskCompletion(clientTask, diskTask) {
  const merged = JSON.parse(JSON.stringify(clientTask))
  const clientDates = clientTask.completedDates && typeof clientTask.completedDates === 'object' ? clientTask.completedDates : {}
  const diskDates = diskTask.completedDates && typeof diskTask.completedDates === 'object' ? diskTask.completedDates : {}
  const dates = Object.assign({}, diskDates, clientDates)
  for (const key of Object.keys(diskDates)) {
    if (diskDates[key]) dates[key] = true
  }
  merged.completedDates = dates
  merged.done = Boolean(clientTask.done) || Boolean(diskTask.done)
  return merged
}

/** Three-way merge of tasks/projects keyed by id: disk additions survive, panel edits win. */
function mergeDocuments(base, disk, client) {
  const conflicts = []
  const tasks = []
  const baseTasks = mapById(base && base.tasks)
  const diskTasks = mapById(disk.tasks)
  const clientTasks = mapById(client.tasks)
  for (const id of new Set([...clientTasks.keys(), ...diskTasks.keys(), ...baseTasks.keys()])) {
    const baseTask = baseTasks.get(id)
    const diskTask = diskTasks.get(id)
    const clientTask = clientTasks.get(id)
    if (clientTask && diskTask) {
      if (sameJson(clientTask, diskTask)) tasks.push(clientTask)
      else if (!baseTask) {
        tasks.push(mergeTaskCompletion(clientTask, diskTask))
        conflicts.push('task:' + id)
      } else if (sameJson(baseTask, clientTask)) tasks.push(diskTask)
      else if (sameJson(baseTask, diskTask)) tasks.push(clientTask)
      else {
        tasks.push(mergeTaskCompletion(clientTask, diskTask))
        conflicts.push('task:' + id)
      }
    } else if (clientTask && !diskTask) {
      if (!baseTask) tasks.push(clientTask)
      else if (sameJson(baseTask, clientTask)) {
        /* deleted on disk by a tool */
      } else {
        tasks.push(clientTask)
        conflicts.push('task:' + id)
      }
    } else if (!clientTask && diskTask) {
      if (!baseTask) tasks.push(diskTask)
      else if (!sameJson(baseTask, diskTask)) {
        tasks.push(diskTask)
        conflicts.push('task:' + id)
      }
      /* else: the panel deleted it and the disk still matches the base -> honour the delete */
    }
  }
  const projectResult = mergeProjects(base ? base.projects : [], disk.projects || [], client.projects || [])
  const document = normalizeDocument({
    version: DOCUMENT_VERSION,
    tasks: sortById(tasks),
    projects: projectResult.projects,
    importedAt: client.importedAt || disk.importedAt || '',
  }) || client
  return { document, conflicts: conflicts.concat(projectResult.conflicts) }
}

/** Without a merge base, keep every record from both sides: never drop data. */
function unionDocuments(disk, client) {
  const conflicts = []
  const tasks = []
  const diskTasks = mapById(disk.tasks)
  const clientTasks = mapById(client.tasks)
  for (const id of new Set([...clientTasks.keys(), ...diskTasks.keys()])) {
    const diskTask = diskTasks.get(id)
    const clientTask = clientTasks.get(id)
    if (clientTask && diskTask && !sameJson(clientTask, diskTask)) conflicts.push('task:' + id)
    tasks.push(clientTask || diskTask)
  }
  const projects = []
  const diskProjects = mapById(disk.projects)
  const clientProjects = mapById(client.projects)
  for (const id of new Set([...clientProjects.keys(), ...diskProjects.keys()])) {
    const diskProject = diskProjects.get(id)
    const clientProject = clientProjects.get(id)
    if (!clientProject) projects.push(diskProject)
    else if (!diskProject) projects.push(clientProject)
    else {
      const merged = JSON.parse(JSON.stringify(clientProject))
      merged.records = merged.records || {}
      merged.records.problem = unionProblemRecords(clientProject, diskProject)
      projects.push(merged)
      if (!sameJson(clientProject, diskProject)) conflicts.push('project:' + id)
    }
  }
  const document = normalizeDocument({
    version: DOCUMENT_VERSION,
    tasks: sortById(tasks),
    projects: sortById(projects),
    importedAt: client.importedAt || '',
  }) || client
  return { document, conflicts }
}

function mergeDocumentsSafely(base, disk, client) {
  return base ? mergeDocuments(base, disk, client) : unionDocuments(disk, client)
}

const PROBE_TOOL = {
  name: 'sidebar_todo_handoff_probe',
  description:
    '临时探针（探索用）：验证 Host 会话 API 可用性——创建 TEST- 前缀会话、改名、可选归档并恢复、最后释放 agent。只操作本调用创建的一次性测试会话，绝不触碰真实会话。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '标题后缀（实际标题为 TEST-<title>）' },
      cwd: { type: 'string', description: '会话工作目录，默认 D:\\dsh' },
      archive: { type: 'boolean', description: 'true 时额外验证归档+恢复' },
      sameTitleTest: { type: 'boolean', description: 'true 时额外用同标题创建第二个会话并归档' },
    },
    additionalProperties: false,
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    const input = isPlainObject(args) ? args : {}
    return runHandoffProbe(pluginCtx, input)
  },
}

const CREATE_SESSION_TOOL = {
  name: 'sidebar_todo_create_session',
  description:
    '创建接班/新对话会话并设置标题（全自动交接用）。参数 { title, cwd?, preset? }。护栏：title 1–60 字；cwd 必须在 D:\\dsh 下；不发送 prompt、不继承历史；会话文件夹需另行创建。优先用 ctx.sessionController.create+rename（更稳），旧版 agents.create 作兜底。返回 { ok, sessionId, title }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', description: '会话标题（1–60 字）' },
      cwd: { type: 'string', description: '会话工作目录，默认 D:\\dsh' },
      preset: { type: 'string', description: '可选 agent preset id' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return createHandoffSession(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: '创建会话', kind: 'other', rawInput: args }),
}

const ARCHIVE_SESSION_TOOL = {
  name: 'sidebar_todo_archive_session',
  description:
    '归档或恢复一个会话（全自动交接用）。参数 { sessionId, archived = true }。护栏：sessionId 格式校验；目标会话 cwd 必须在 D:\\dsh 下；禁止归档调用者自身会话（SELF_ARCHIVE_REFUSED）；不提供删除会话能力。返回 { ok, archived, archivedSessionIds }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', description: '目标会话 id（session-…）' },
      archived: { type: 'boolean', description: 'true 归档（默认），false 恢复' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return archiveHandoffSession(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: '归档/恢复会话', kind: 'other', rawInput: args }),
}

const WAKE_SESSION_TOOL = {
  name: 'sidebar_todo_wake_session',
  description:
    '向一个会话投递一条文本消息（唤醒，等价 send_to_session）。参数 { sessionId, text, mode? }。护栏：text 非空且 ≤16KB；目标会话 cwd 必须在 D:\\dsh 下；mode 默认 queue。返回 { ok, delivered, sessionId }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId', 'text'],
    properties: {
      sessionId: { type: 'string', description: '目标会话 id（session-…）' },
      text: { type: 'string', description: '要投递的文本（≤16KB）' },
      mode: { type: 'string', enum: ['queue', 'steer'], description: '默认 queue' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    const input = isPlainObject(args) ? args : {}
    return deliverSessionPrompt(pluginCtx, String(input.sessionId || '').trim(), String(input.text || ''), input.mode)
  },
  presentCall: (args) => ({ card: 'generic', title: '唤醒会话', kind: 'other', rawInput: args }),
}

/**
 * Preset spike probe: measure a session's tool schema size under a target preset,
 * then restore the original preset. Exploration only; no files are written.
 */
async function runPresetProbe(ctx, input) {
  if (!ctx || typeof ctx.get !== 'function') return handoffError('NO_CONTEXT', '插件未 apply')
  const target = String((input && input.preset) || '').trim()
  if (!target) return handoffError('BAD_REQUEST', 'preset 不能为空')
  const registry = ctx.get('agentPresets')
  const tools = ctx.get('tools')
  const agents = ctx.get('agents')
  if (!registry || typeof registry.select !== 'function') return handoffError('SERVICE_MISSING', 'ctx.agentPresets.select 不可用')
  if (!tools || typeof tools.schemas !== 'function') return handoffError('SERVICE_MISSING', 'ctx.tools.schemas 不可用')
  const wantedId = String((input && input.sessionId) || '').trim()
  const agent = wantedId && agents && typeof agents.get === 'function' ? agents.get(wantedId) : agents && typeof agents.currentInitiator === 'function' ? agents.currentInitiator() : null
  if (!agent) return handoffError('NO_AGENT', '找不到目标 agent（需在会话内调用或传 sessionId）')
  const measure = () => {
    try {
      const list = tools.schemas(agent)
      return {
        count: list.length,
        bytes: Buffer.byteLength(JSON.stringify(list), 'utf8'),
        names: list.map((item) => item.name),
      }
    } catch (error) {
      return { error: String((error && error.message) || error) }
    }
  }
  const before = measure()
  let original = ''
  try {
    if (typeof registry.composedPreset === 'function') original = String(registry.composedPreset(agent.ctx) || '')
  } catch (error) {
    original = ''
  }
  let applied = null
  try {
    applied = await registry.select(agent, target)
  } catch (error) {
    return handoffError((error && error.code) || 'SELECT_FAILED', String((error && error.message) || error), { before, originalPreset: original })
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
  const after = measure()
  let restored = null
  if (original && original !== target) {
    try {
      restored = await registry.select(agent, original)
    } catch (error) {
      restored = 'ERROR:' + String((error && error.message) || error)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  const afterRestore = measure()
  return {
    ok: true,
    preset: target,
    originalPreset: original,
    applied,
    before,
    after,
    restored,
    afterRestore,
    note: 'schema 体积按 JSON 序列化字节计；select 会对 live agent 立即重组 scope；本探针会恢复原 preset。',
  }
}

const PRESET_PROBE_TOOL = {
  name: 'sidebar_todo_preset_probe',
  description:
    '临时探针（探索用）：测量某会话在指定 agent preset 下的工具数量与 schema 体积，测量后恢复原 preset。只读不写盘；用于 preset 工具裁剪 spike。参数 { preset, sessionId? }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['preset'],
    properties: {
      preset: { type: 'string', description: '目标 preset id（如 minimal / standard / role-gui）' },
      sessionId: { type: 'string', description: '目标会话 id，省略时用调用者自身会话' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return runPresetProbe(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: 'preset 探针', kind: 'read', rawInput: args }),
}

/** Rename one session; an archived session gets a temporary unarchive→rename→archive round trip. */
async function renameHandoffSession(ctx, input) {
  if (!ctx || typeof ctx.get !== 'function') return handoffError('NO_CONTEXT', '插件未 apply')
  const sessionId = String((input && input.sessionId) || '').trim()
  const title = String((input && input.title) || '').trim()
  if (!sessionIdIsValid(sessionId)) return handoffError('BAD_REQUEST', 'sessionId 非法：' + sessionId)
  if (!title) return handoffError('TITLE_REQUIRED', 'title 不能为空')
  if (title.length > 60) return handoffError('TITLE_TOO_LONG', 'title 超过 60 字：' + title.length)
  const controller = ctx.get('sessionController')
  const sessionTitle = ctx.get('sessionTitle')
  const sessions = ctx.get('sessions')
  let directError = null
  // 1) Preferred: resumes a cold session and renames it.
  if (controller && typeof controller.rename === 'function') {
    try {
      const value = await controller.rename({ sessionId, title })
      return {
        ok: true,
        sessionId,
        title: String((value && value.title) || title),
        unarchivedTemporarily: false,
        api: 'sessionController.rename',
      }
    } catch (error) {
      directError = error
    }
  }
  // 2) Live-session path (sessionTitle.rename needs the Session object).
  const live = sessions && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined
  if (live && sessionTitle && typeof sessionTitle.rename === 'function') {
    try {
      const snapshot = sessionTitle.rename(live, title)
      return {
        ok: true,
        sessionId,
        title: String((snapshot && snapshot.title) || title),
        unarchivedTemporarily: false,
        api: 'sessionTitle.rename',
      }
    } catch (error) {
      if (!directError) directError = error
    }
  }
  // 3) Archived session: unarchive → rename → archive again.
  const workspaceController = ctx.get('workspaceController')
  if (workspaceController && typeof workspaceController.unarchiveSession === 'function') {
    let unarchived = false
    try {
      await workspaceController.unarchiveSession({ sessionId })
      unarchived = true
      let renamed = null
      if (controller && typeof controller.rename === 'function') {
        renamed = await controller.rename({ sessionId, title })
      } else if (sessionTitle && typeof sessionTitle.rename === 'function' && sessions && typeof sessions.get === 'function') {
        const session = sessions.get(sessionId)
        if (!session) throw new Error('取不到 live session')
        renamed = sessionTitle.rename(session, title)
      } else {
        throw new Error('没有可用的 rename 接口')
      }
      if (typeof workspaceController.archiveSession === 'function') {
        await workspaceController.archiveSession({ sessionId, stopActivity: true })
      }
      return {
        ok: true,
        sessionId,
        title: String((renamed && renamed.title) || title),
        unarchivedTemporarily: true,
        api: 'unarchive→rename→archive',
      }
    } catch (error) {
      if (unarchived && typeof workspaceController.archiveSession === 'function') {
        try {
          await workspaceController.archiveSession({ sessionId, stopActivity: true })
        } catch (restoreError) {
          /* best effort */
        }
      }
      return handoffError('ARCHIVED_RENAME_UNSUPPORTED', '归档会话改名失败：' + String((error && error.message) || error), {
        sessionId,
        directError: directError ? String((directError && directError.message) || directError) : '',
        stack: String((error && error.stack) || ''),
      })
    }
  }
  return handoffError('RENAME_FAILED', '改名失败：' + String((directError && directError.message) || directError || '无可用的 rename 接口'), {
    sessionId,
    directError: directError ? String((directError && directError.message) || directError) : '',
  })
}

/** Default dsh integrations root (wecom/weixin bot state). */
const INTEGRATIONS_DEFAULT = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.dsh', 'integrations')

async function collectIntegrationStateFiles(root) {
  const out = []
  const walk = async (directory, depth) => {
    if (depth > 4) return
    let entries = []
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true })
    } catch (error) {
      return
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile() && entry.name === 'state.json') out.push(full)
    }
  }
  await walk(root, 0)
  return out
}

/** Rebind stored bot→session mappings after a handoff (integrations state.json only). */
async function imRebindSessions(ctx, input) {
  const fromId = String((input && input.fromSessionId) || '').trim()
  const toId = String((input && input.toSessionId) || '').trim()
  if (!sessionIdIsValid(fromId) || !sessionIdIsValid(toId)) return handoffError('BAD_REQUEST', 'sessionId 非法：' + fromId + ' / ' + toId)
  if (fromId === toId) return handoffError('BAD_REQUEST', 'fromSessionId 与 toSessionId 相同')
  const dirInput = String((input && input.dir) || '').trim()
  const root = dirInput ? hostCopyResolve(dirInput) : INTEGRATIONS_DEFAULT
  if (!root) return handoffError('PATH_OUTSIDE', '测试目录必须在 ' + WAKE_ALLOWED_ROOT + ' 下：' + dirInput)
  const files = await collectIntegrationStateFiles(root)
  if (files.length === 0) return handoffError('NOT_FOUND', '未找到 state.json：' + root)
  const results = []
  let totalReplaced = 0
  for (const file of files) {
    let json = null
    try {
      json = JSON.parse(await fsp.readFile(file, 'utf8'))
    } catch (error) {
      results.push({ path: file, replaced: 0, error: 'JSON 解析失败' })
      continue
    }
    const map = json && typeof json === 'object' ? json.sessions : null
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      results.push({ path: file, replaced: 0, error: '没有 sessions 映射' })
      continue
    }
    let replaced = 0
    for (const key of Object.keys(map)) {
      if (String(map[key]) === fromId) {
        map[key] = toId
        replaced += 1
      }
    }
    if (replaced === 0) {
      results.push({ path: file, replaced: 0 })
      continue
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = file + '.bak-' + stamp
    try {
      await fsp.copyFile(file, backup)
      await fsp.writeFile(file, JSON.stringify(json, null, 2), 'utf8')
      results.push({ path: file, replaced, backup })
      totalReplaced += replaced
    } catch (error) {
      results.push({ path: file, replaced: 0, error: String((error && error.message) || error) })
    }
  }
  return { ok: true, root, fromSessionId: fromId, toSessionId: toId, files: results, totalReplaced }
}

const RENAME_SESSION_TOOL = {
  name: 'sidebar_todo_rename_session',
  description:
    '给会话改名（交接用）。参数 { sessionId, title }。护栏：title 非空 ≤60、sessionId 格式；归档会话会先临时 unarchive → rename → 再 archive；若归档会话无法改名返回结构化 ARCHIVED_RENAME_UNSUPPORTED。返回 { ok, sessionId, title, unarchivedTemporarily }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId', 'title'],
    properties: {
      sessionId: { type: 'string', description: '目标会话 id（session-…）' },
      title: { type: 'string', description: '新标题（1–60 字）' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return renameHandoffSession(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: '会话改名', kind: 'other', rawInput: args }),
}

const IM_REBIND_TOOL = {
  name: 'sidebar_todo_im_rebind',
  description:
    '交接时迁移企微/微信机器人的"会话绑定"：扫描 dsh integrations 下所有 state.json 的 sessions 映射，把值等于 fromSessionId 的改为 toSessionId。参数 { fromSessionId, toSessionId, dir? }（dir 仅测试用，必须在 D:\\dsh 下）。改前备份同目录 state.json.bak-<ts>；只改 integrations 里的 state.json。返回 { ok, files, totalReplaced }。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['fromSessionId', 'toSessionId'],
    properties: {
      fromSessionId: { type: 'string', description: '旧会话 id' },
      toSessionId: { type: 'string', description: '接班会话 id' },
      dir: { type: 'string', description: '可选：测试用 integrations 根目录（必须在 D:\\dsh 下）' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return imRebindSessions(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: 'IM 会话绑定迁移', kind: 'edit', rawInput: args }),
}

/** Host-rewrite a text file so DSH can read it again after a non-Host writer broke it (DLP). */
async function repairTextFile(ctx, input) {
  if (!ctx) return handoffError('NO_CONTEXT', '插件未 apply')
  const inputPath = String((input && input.path) || '').trim()
  const resolved = hostCopyResolve(inputPath)
  if (!resolved) return handoffError('PATH_OUTSIDE', 'path 必须在 ' + WAKE_ALLOWED_ROOT + ' 下：' + inputPath)
  const extension = path.extname(resolved).toLowerCase()
  if (['.json', '.md', '.txt', '.log'].indexOf(extension) < 0) {
    return handoffError('PATH_REFUSED', '只允许 .json/.md/.txt/.log：' + extension)
  }
  let stat = null
  try {
    stat = await fsp.stat(resolved)
  } catch (error) {
    return handoffError('NOT_FOUND', '文件不存在：' + resolved)
  }
  if (!stat.isFile()) return handoffError('NOT_FOUND', '不是文件：' + resolved)
  const raw = await fsp.readFile(resolved)
  if (raw.length >= 2 && raw[0] === 0xe0 && raw[1] === 0xa8) {
    return handoffError('REPAIR_SOURCE_ENCRYPTED', '磁盘上已是 DLP 加密容器，取不到明文；请改用明文副本（如 .bin）：' + resolved)
  }
  const text = raw.toString('utf8')
  if (extension === '.json') {
    try {
      JSON.parse(text)
    } catch (error) {
      return handoffError('REPAIR_INVALID_JSON', '内容不是合法 JSON：' + String((error && error.message) || error))
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = resolved + '.repair-bak-' + stamp
  try {
    await fsp.copyFile(resolved, backup)
  } catch (error) {
    return handoffError('BACKUP_FAILED', '改前备份失败：' + String((error && error.message) || error))
  }
  let method = ''
  const fsService = ctx.get('fs')
  if (fsService && typeof fsService.resolve === 'function' && typeof fsService.writeText === 'function') {
    try {
      const target = await fsService.resolve(resolved)
      await fsService.writeText(target, text)
      method = 'ctx.fs.writeText'
    } catch (error) {
      method = ''
    }
  }
  if (!method) {
    try {
      await fsp.writeFile(resolved, text, 'utf8')
      method = 'host-fsp.writeFile'
    } catch (error) {
      return handoffError('REPAIR_WRITEBACK_UNREADABLE', 'Host 写回失败：' + String((error && error.message) || error), { backup, path: resolved })
    }
  }
  let after = null
  try {
    after = await fsp.readFile(resolved)
  } catch (error) {
    return handoffError('REPAIR_WRITEBACK_UNREADABLE', '写回后读不回文件：' + String((error && error.message) || error), { backup, path: resolved })
  }
  if (after.length !== raw.length) {
    return handoffError('REPAIR_WRITEBACK_UNREADABLE', '写回后大小不一致（' + after.length + ' vs ' + raw.length + '）', { backup, path: resolved })
  }
  const sha256 = createHash('sha256').update(after).digest('hex')
  return {
    ok: true,
    path: resolved,
    bytes: after.length,
    sha256,
    backup,
    method,
    readableHint: '请用 DSH read 验证该路径：' + resolved,
  }
}

const REPAIR_TEXT_TOOL = {
  name: 'sidebar_todo_repair_text',
  description:
    '维护用：把被非 Host 进程写坏（DSH read 报 binary）的文本文件用 Host 写回同一路径，使其重新可读。参数 { path }（必须在 D:\\dsh 下，扩展名 .json/.md/.txt/.log）。写前备份同目录 *.repair-bak-<时间戳>；写后返回 { ok,path,bytes,sha256,backup,method,readableHint }；失败返回结构化错误（REPAIR_SOURCE_ENCRYPTED / REPAIR_INVALID_JSON / REPAIR_WRITEBACK_UNREADABLE）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['path'],
    properties: {
      path: { type: 'string', description: '要修复的文本文件绝对路径（D:\\dsh 下）' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    return repairTextFile(pluginCtx, isPlainObject(args) ? args : {})
  },
  presentCall: (args) => ({ card: 'generic', title: '文本修复（Host 写回）', kind: 'edit', rawInput: args }),
}

const READ_TOOL = {
  name: TOOL_READ,
  description:
    '读取「侧栏待办」的数据（Host 半现读 state.json，只读、不触发保存）。scope=today|week|month|projects|notes|all，date 可选 yyyy-MM-dd（默认今天），json=true 时返回 JSON（字段与面板一致），否则返回 Markdown 摘要。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scope: { type: 'string', enum: ['today', 'week', 'month', 'projects', 'notes', 'all'], description: '读取范围，默认 today' },
      date: { type: 'string', description: '基准日期 yyyy-MM-dd，默认今天' },
      json: { type: 'boolean', description: 'true 返回 JSON，false/缺省返回 Markdown' },
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['format', 'text', 'counts'],
      properties: {
        format: { type: 'string', enum: ['markdown', 'json'] },
        text: { type: 'string' },
        counts: {
          type: 'object',
          additionalProperties: false,
          required: ['tasks', 'projects'],
          properties: { tasks: { type: 'integer' }, projects: { type: 'integer' } },
        },
      },
    },
    render: (args, value) => [{ type: 'text', text: value && typeof value.text === 'string' ? value.text : '（无内容）' }],
  },
  async execute(args) {
    const input = isPlainObject(args) ? args : {}
    const scope = String(input.scope || 'today')
    const anchorKey = input.date ? String(input.date) : localDateKey(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorKey)) throw new Error('date 需为 yyyy-MM-dd：' + anchorKey)
    if (['today', 'week', 'month', 'projects', 'notes', 'all'].indexOf(scope) < 0) throw new Error('不支持的 scope：' + scope)
    const { document } = await readTodoDocumentFromDisk()
    const view = collectTodoView(document, scope, anchorKey)
    const text = input.json === true ? JSON.stringify(view, null, 2) : formatTodoViewMarkdown(view)
    return { format: input.json === true ? 'json' : 'markdown', text, counts: view.counts }
  },
  presentCall: (args) => ({ card: 'generic', title: '读取侧栏待办', kind: 'read', rawInput: args }),
}

const MERGE_TOOL = {
  name: TOOL_MERGE,
  description:
    '向「侧栏待办」合并写入（Host 内读→校验→先备份到 backups/→原子写入）。参数 ops：add-task(text/category/repeat/customDays/startDate/month)、add-note(text)、add-project-problem(projectName/text)、delete-project-problem(projectId|projectName + recordId 优先 / text 校验，记录不存在返回 NOT_FOUND)、set-done(id/done/date)、update-task(id + text/category/repeat/customDays/startDate/month)、delete-task(id/text，仅限随手记且 text 必须匹配)。参数 dryRun=true 时只解析与校验并返回将产生的变更，不写盘、不备份（试跑合并请务必用它）。任何 op 失败则整批不写入；写入后面板可能持有旧状态，建议让用户刷新面板。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['ops'],
    properties: {
      dryRun: { type: 'boolean', description: 'true 只做解析与校验并返回将产生的变更，不写盘、不备份' },
      ops: {
        type: 'array',
        description: '按顺序执行的 op 列表，最多 50 个',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op'],
          properties: {
            op: { type: 'string', enum: ['add-task', 'add-note', 'add-project-problem', 'delete-project-problem', 'set-done', 'update-task', 'delete-task'] },
            text: { type: 'string' },
            category: { type: 'string' },
            repeat: { type: 'string' },
            customDays: { type: 'array', items: { type: 'string' } },
            startDate: { type: 'string' },
            month: { type: 'string' },
            projectName: { type: 'string' },
            projectId: { type: 'integer' },
            recordId: { type: 'integer' },
            createdAt: { type: 'string' },
            id: { type: 'integer' },
            done: { type: 'boolean' },
            date: { type: 'string' },
          },
        },
      },
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['applied', 'counts', 'backupPath'],
      properties: {
        applied: { type: 'integer' },
        counts: {
          type: 'object',
          additionalProperties: false,
          required: ['tasks', 'projects'],
          properties: { tasks: { type: 'integer' }, projects: { type: 'integer' } },
        },
        backupPath: { type: 'string' },
        dryRun: { type: 'boolean' },
        warning: { type: 'string' },
        details: { type: 'array', items: { type: 'string' } },
      },
    },
    render: (args, value) => {
      if (value && value.dryRun) {
        return [{ type: 'text', text: '（试跑，未写入）将执行 ' + value.applied + ' 个 op；预计任务 ' + value.counts.tasks + ' 条 / 项目 ' + value.counts.projects + ' 个\n' + (value.details || []).join('\n') }]
      }
      const lines = ['已写入 ' + (value ? value.applied : 0) + ' 个 op；任务 ' + (value ? value.counts.tasks : 0) + ' 条 / 项目 ' + (value ? value.counts.projects : 0) + ' 个']
      if (value && value.backupPath) lines.push('备份：' + value.backupPath)
      if (value && value.warning) lines.push('⚠️ ' + value.warning)
      return [{ type: 'text', text: lines.join('\n') }]
    },
  },
  async execute(args) {
    const input = isPlainObject(args) ? args : {}
    const ops = Array.isArray(input.ops) ? input.ops : []
    if (ops.length === 0) throw new Error('ops 不能为空')
    if (ops.length > 50) throw new Error('一次最多 50 个 op')
    const dryRun = input.dryRun === true
    const directory = await ensureDirectory()
    const { document } = await readTodoDocumentFromDisk()
    const { document: next, applied } = applyMergeOps(document, ops)
    const counts = { tasks: next.tasks.length, projects: next.projects.length }
    if (dryRun) {
      return { applied: applied.length, counts, backupPath: '', dryRun: true, details: applied }
    }
    const backupPath = await backupForTool(directory)
    await writeFileAtomic(path.join(directory, STATE_FILE), JSON.stringify(next, null, 2))
    const warning = lastPanelActivityAt > 0 && Date.now() - lastPanelActivityAt < PANEL_FRESH_MS
      ? 'panel is open; its next save will auto-merge this change — ask the user to refresh to see it'
      : ''
    return {
      applied: applied.length,
      counts,
      backupPath,
      warning,
      dryRun: false,
      details: applied,
    }
  },
  presentCall: (args) => ({ card: 'generic', title: '写入侧栏待办', kind: 'edit', rawInput: args }),
}

/** Register both agent tools; a registration failure is logged, never fatal. */
function registerTodoTools(ctx) {
  const disposers = []
  for (const definition of [READ_TOOL, MERGE_TOOL, PROBE_TOOL, CREATE_SESSION_TOOL, ARCHIVE_SESSION_TOOL, WAKE_SESSION_TOOL, PRESET_PROBE_TOOL, RENAME_SESSION_TOOL, IM_REBIND_TOOL, REPAIR_TEXT_TOOL]) {
    try {
      disposers.push(ctx.tools.register(definition))
    } catch (error) {
      console.error('[sidebar-todo] registering the host tool failed: ' + definition.name, error)
    }
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        const result = dispose()
        if (result && typeof result.then === 'function') result.then(() => undefined, () => undefined)
      } catch (error) {
        /* the registry may already be gone during unload */
      }
    }
  }
}

export function apply(ctx) {
  pluginCtx = ctx
  // Publish the API routes while this plugin is loaded.
  ctx.effect(
    () => {
      const releases = []
      for (const name of Object.keys(handlers)) {
        try {
          const release = ctx.connection.fetch.register({
            path: API_BASE + '.' + name,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: (request) => handlers[name](request),
          })
          releases.push(release)
        } catch (error) {
          console.error('[sidebar-todo] registering the API route failed: ' + name, error)
        }
      }
      return () => {
        for (const release of releases.splice(0)) {
          try {
            const result = release()
            if (result && typeof result.then === 'function') {
              result.then(
                () => undefined,
                () => undefined,
              )
            }
          } catch (error) {
            /* the connection may already be gone during unload */
          }
        }
      }
    },
    'sidebar-todo: api routes',
  )
  // Agent tools: read / merge the same document the panel owns.
  ctx.effect(() => registerTodoTools(ctx), 'sidebar-todo: host tools')
  // Exploration probe (T-008): run once after load and persist the JSON result.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      runHandoffProbeOnce(ctx).catch(() => undefined)
    }, 2000)
    return () => clearTimeout(timer)
  }, 'sidebar-todo: handoff probe once')
}
