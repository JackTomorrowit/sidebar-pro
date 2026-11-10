/**
 * Host half of the Sidebar Notes bundle.
 *
 * The panel itself lives in the browser, but the notes must outlive the page and
 * be readable by other tools (and agents). This half therefore:
 *   - persists the whole document as `state.json` plus one Markdown file per note
 *     in the notes directory (default `D:\dsh\shared\notes`, override with
 *     `DSH_SIDEBAR_NOTES_DIR`);
 *   - serves the same-origin JSON API the browser panel drives, through exact
 *     `/api/sidebarNotes.*` routes registered with `ctx.connection.fetch`.
 *
 * The Client half keeps its localStorage copy as a fallback and mirrors every
 * save here.
 */
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PLUGIN_VERSION = '1.3.0'
/** Absolute registration paths of the panel API; each carries one operation. */
const API_BASE = '/api/sidebarNotes'
/** Panel document version, bumped when the note shape changes. */
const DOCUMENT_VERSION = 1
const MAX_NOTES = 40
const MAX_TITLE = 120
const MAX_BODY = 1024 * 1024
const STATE_FILE = 'state.json'
const MARKDOWN_SUFFIX = '.md'

export const inject = ['connection']

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function newId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function clip(value, max) {
  const text = String(value ?? '')
  return text.length > max ? text.slice(0, max) : text
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** A file-name stem that is safe on Windows and still readable. */
function safeTitle(value) {
  let name = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  name = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
  if (!name || name === '.' || name === '..') return 'note'
  return name.length > MAX_TITLE ? name.slice(0, MAX_TITLE).trim() : name
}

function normalizeNote(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  const id =
    typeof candidate.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(candidate.id)
      ? candidate.id
      : newId()
  return {
    id,
    title: typeof candidate.title === 'string' ? clip(candidate.title, MAX_TITLE) : '',
    body: typeof candidate.body === 'string' ? clip(candidate.body, MAX_BODY) : '',
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  }
}

/** Accept only a well-formed document; anything else is refused. */
function normalizeDocument(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.notes)) return null
  const notes = []
  for (const candidate of value.notes) {
    const note = normalizeNote(candidate)
    if (!note) continue
    notes.push(note)
    if (notes.length >= MAX_NOTES) break
  }
  if (notes.length === 0) return null
  const wanted = typeof value.activeId === 'string' ? value.activeId : ''
  const activeId = notes.some((note) => note.id === wanted) ? wanted : notes[0].id
  return { activeId, notes, version: DOCUMENT_VERSION, updatedAt: Date.now() }
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

function fail(status, message) {
  return json({ error: message }, status)
}

function isoDate(millis) {
  return new Date(millis).toISOString()
}

/** Markdown with a small front matter so note metadata survives a rebuild. */
function renderMarkdown(note) {
  return [
    '---',
    'id: ' + note.id,
    'title: ' + JSON.stringify(note.title),
    'created: ' + isoDate(note.createdAt),
    'updated: ' + isoDate(note.updatedAt),
    '---',
    '',
    note.body,
    '',
  ].join('\n')
}

function parseMarkdown(raw, fallbackName) {
  const text = String(raw ?? '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return null
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value)
      } catch (error) {
        /* keep the raw text */
      }
    }
    meta[key] = value
  }
  const id =
    typeof meta.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(meta.id) ? meta.id : null
  if (!id) return null
  const created = Date.parse(meta.created)
  const updated = Date.parse(meta.updated)
  const body = match[2].endsWith('\n') ? match[2].slice(0, -1) : match[2]
  return {
    id,
    title: typeof meta.title === 'string' ? meta.title : fallbackName,
    body,
    createdAt: Number.isFinite(created) ? created : Date.now(),
    updatedAt: Number.isFinite(updated) ? updated : Date.now(),
  }
}

/** Resolve once: env override, else this workspace, else the DSH home directory. */
let cachedDirectory = null
async function resolveDirectory() {
  if (cachedDirectory) return cachedDirectory
  const override = process.env.DSH_SIDEBAR_NOTES_DIR
  if (override && override.trim()) {
    cachedDirectory = path.resolve(override.trim())
    return cachedDirectory
  }
  const workspace = 'D:\\dsh'
  try {
    const stat = await fsp.stat(workspace)
    if (stat.isDirectory()) {
      cachedDirectory = path.join(workspace, 'shared', 'notes')
      return cachedDirectory
    }
  } catch (error) {
    /* not this machine's workspace: fall through to the profile directory */
  }
  cachedDirectory = path.join(os.homedir(), '.dsh', 'sidebar-notes')
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

/** Exact document from `state.json`, else rebuilt from the Markdown files. */
async function readDocument(directory) {
  const statePath = path.join(directory, STATE_FILE)
  try {
    const raw = await fsp.readFile(statePath, 'utf8')
    const document = normalizeDocument(JSON.parse(raw))
    if (document) return document
  } catch (error) {
    /* missing or unreadable state: rebuild from the Markdown files below */
  }
  let entries = []
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true })
  } catch (error) {
    return null
  }
  const notes = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(MARKDOWN_SUFFIX)) continue
    try {
      const raw = await fsp.readFile(path.join(directory, entry.name), 'utf8')
      const note = parseMarkdown(raw, entry.name.slice(0, -MARKDOWN_SUFFIX.length))
      if (note) notes.push(note)
    } catch (error) {
      /* skip unreadable notes instead of failing the whole load */
    }
  }
  if (notes.length === 0) return null
  notes.sort((left, right) => left.createdAt - right.createdAt)
  return { activeId: notes[0].id, notes, version: DOCUMENT_VERSION, updatedAt: Date.now() }
}

/** Delete the Markdown files of notes that were renamed or removed. */
async function removeStaleMarkdown(directory, expectedNames) {
  let entries = []
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true })
  } catch (error) {
    return
  }
  const expected = new Set(expectedNames)
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(MARKDOWN_SUFFIX)) continue
    if (expected.has(entry.name)) continue
    // Only plugin-generated names carry the `--<id>.md` suffix; leave anything else alone.
    if (!/--[A-Za-z0-9_-]{1,64}\.md$/.test(entry.name)) continue
    try {
      await fsp.unlink(path.join(directory, entry.name))
    } catch (error) {
      /* a locked file is retried on the next save */
    }
  }
}

const handlers = {
  async load() {
    try {
      const directory = await ensureDirectory()
      const document = await readDocument(directory)
      return json({ version: PLUGIN_VERSION, directory, document })
    } catch (error) {
      return fail(500, '读取本地便签失败：' + messageOf(error))
    }
  },

  async save(request) {
    const body = await readBody(request)
    if (!body || typeof body.document !== 'object' || body.document === null) {
      return fail(400, '请求缺少数值：document')
    }
    const document = normalizeDocument(body.document)
    if (!document) return fail(400, '便签文档为空或格式不正确')
    try {
      const directory = await ensureDirectory()
      await writeFileAtomic(path.join(directory, STATE_FILE), JSON.stringify(document, null, 2))
      const files = []
      for (const note of document.notes) {
        const fileName = safeTitle(note.title) + '--' + note.id + MARKDOWN_SUFFIX
        await writeFileAtomic(path.join(directory, fileName), renderMarkdown(note))
        files.push(fileName)
      }
      await removeStaleMarkdown(directory, files)
      return json({ version: PLUGIN_VERSION, directory, files, document })
    } catch (error) {
      return fail(500, '保存本地便签失败：' + messageOf(error))
    }
  },
}

export function apply(ctx) {
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
          console.error('[sidebar-notes] registering the API route failed: ' + name, error)
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
    'sidebar-notes: api routes',
  )
}
