/**
 * Preset-scoped tool restriction helper for the sidebar-todo bundle.
 *
 * A preset row references this plugin with config `{ allow: [...], deny: [...] }`:
 *   - `allow` keeps only those GLOBAL tools in the preset's agent scope;
 *   - `deny` removes those global tools.
 * Scoped (preset-mounted) tools are unaffected — they are chosen by the preset's
 * `plugins` list. Empty allow/deny is skipped (the registry rejects empty filters).
 *
 * Example preset plugin row:
 *   - id: tool-allowlist
 *     name: '@local/sidebar-todo/preset-restrict'
 *     config:
 *       allow: ['read', 'write', 'send_to_session']
 */
export const name = 'sidebar-todo/preset-restrict'

export const inject = ['tools']

export function apply(ctx, config) {
  const configOf = config && typeof config === 'object' ? config : {}
  const normalize = (value) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [])
  const allow = normalize(configOf.allow)
  const deny = normalize(configOf.deny)
  if (allow.length === 0 && deny.length === 0) return
  const filter = {}
  if (allow.length > 0) filter.allow = allow
  if (deny.length > 0) filter.deny = deny
  ctx.effect(() => ctx.tools.restrict(filter), 'sidebar-todo: preset-restrict')
}
