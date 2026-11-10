/**
 * Host half of the Session Bridge bundle.
 *
 * Registers one tool that admits a prompt into another Session through the
 * Host's `sessionController.prompt` API, which is the same path the Web UI
 * uses when a person sends a message. Nothing here writes session files.
 *
 * Every delivered message carries an automatic sender header, because the
 * receiving Agent sees an ordinary user message and cannot otherwise tell
 * which conversation spoke.
 *
 * Since 0.2.1 the conversations root is configurable in the plugin settings
 * (`workspaceRoot` / `conversationsDir`) so the same package can be installed
 * on another machine whose workspace lives elsewhere.
 */
import { randomUUID } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'session-bridge'
export const inject = ['tools', 'sessionController']

export const Config = z.object({
  workspaceRoot: z
    .string()
    .default('')
    .description('要应用的工作区根目录（留空 = 当前进程工作目录，例如 D:\\dsh）'),
  conversationsDir: z
    .string()
    .default('')
    .description('对话根目录（留空 = <工作区>/conversations）'),
})

/** Candidate conversation roots, most specific first. */
function candidateRoots(config) {
  const ws = String(config?.workspaceRoot ?? '').trim()
  const conv = String(config?.conversationsDir ?? '').trim()
  const roots = []
  if (conv) roots.push(conv)
  if (ws) {
    roots.push(path.join(ws, 'conversations'))
    roots.push(ws)
  }
  if (!roots.length) roots.push(path.join(process.cwd(), 'conversations'))
  return [...new Set(roots.map((item) => path.resolve(item)))]
}

async function readMeta(file) {
  const meta = JSON.parse(await fsp.readFile(file, 'utf8'))
  if (!meta || typeof meta.sessionId !== 'string' || !meta.sessionId) {
    throw new Error(`session.json 缺少 sessionId：${file}`)
  }
  return meta
}

async function resolveConversation(roots, rawTarget) {
  const raw = String(rawTarget ?? '').trim()
  if (!raw) throw new Error('target 不能为空：请给对话文件夹名（如 20261030-ht）或 sessionId')

  if (raw.startsWith('session-')) {
    const sender = await findBySessionId(roots, raw)
    return { sessionId: raw, folder: sender?.folder ?? null, title: sender?.title ?? null }
  }

  const errors = []
  for (const root of roots) {
    const metaPath = path.join(root, raw, 'session.json')
    try {
      const meta = await readMeta(metaPath)
      return { sessionId: meta.sessionId, folder: raw, title: meta.title ?? null }
    } catch (error) {
      errors.push(`${metaPath}（${error?.code ?? error?.message ?? 'unknown'}）`)
    }
  }
  throw new Error(
    `读不到对话映射，已尝试：${errors.join('；')}。` +
      '请在插件设置里配置 workspaceRoot 或 conversationsDir。',
  )
}

async function findBySessionId(roots, sessionId) {
  if (!sessionId) return null
  for (const root of roots) {
    let entries = []
    try {
      entries = await fsp.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const meta = await readMeta(path.join(root, entry.name, 'session.json'))
        if (meta.sessionId === sessionId) {
          return { folder: entry.name, title: meta.title ?? null }
        }
      } catch {
        // 没有 session.json 或读不到的目录跳过
      }
    }
  }
  return null
}

function senderHeader(sender, callerSessionId) {
  if (sender && sender.folder) {
    const label = sender.title
      ? `${sender.title} · conversations/${sender.folder}`
      : `conversations/${sender.folder}`
    return `[来自 ${label}]`
  }
  return `[来自 ${callerSessionId ?? '未知会话'}]`
}

export async function apply(ctx, config = {}) {
  const roots = candidateRoots(config)
  ctx.logger?.info?.(`[session-bridge] conversations roots: ${roots.join(' | ')}`)

  ctx.effect(() =>
    ctx.tools.register({
      name: 'send_to_session',
      description:
        'Send one text message to another conversation in the configured DSH workspace (cross-session delivery). ' +
        'target is a conversation folder name such as 20261030-ht, or an exact sessionId such as session-725e6c0e-…. ' +
        'mode queue waits for the target to finish its current turn; steer interrupts it. ' +
        'Every message is prefixed automatically with a "[来自 <title> · conversations/<folder>]" sender header so the ' +
        'receiver knows who spoke. The workspace/conversations root is set in this plugin\'s settings ' +
        '(workspaceRoot / conversationsDir).',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: '对话文件夹名（如 20261030-ht）或 sessionId（session-…）',
          },
          text: { type: 'string', description: '要发送的消息正文（会自动加发件人前缀）' },
          mode: {
            type: 'string',
            enum: ['queue', 'steer'],
            description: 'queue = 排队到目标当前回合之后（默认）；steer = 立刻插话',
          },
        },
        required: ['target', 'text'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        const input = args && typeof args === 'object' ? args : {}
        const rawText = String(input.text ?? '')
        if (!rawText.trim()) throw new Error('text 不能为空')

        const callerSessionId = exec.agent?.id ?? null
        const target = await resolveConversation(roots, input.target)
        const mode = input.mode === 'steer' ? 'steer' : 'queue'

        const sender = await findBySessionId(roots, callerSessionId)
        const header = senderHeader(sender, callerSessionId)
        const text = rawText.startsWith('[来自 ') ? rawText : `${header}\n${rawText}`

        await ctx.sessionController.prompt(
          {
            requestId: randomUUID(),
            sessionId: target.sessionId,
            mode,
            content: [{ type: 'text', text }],
          },
          exec.signal,
        )

        return {
          ok: true,
          sessionId: target.sessionId,
          folder: target.folder,
          title: target.title,
          mode,
          sender: sender ?? { sessionId: callerSessionId },
          deliveredChars: text.length,
          header,
          roots,
        }
      },
    }),
  )
}
