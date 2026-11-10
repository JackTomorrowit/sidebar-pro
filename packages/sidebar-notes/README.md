# Sidebar Notes (`@local/sidebar-notes`)

A small DSH plugin that adds **its own entry to the left sidebar** of the Harness Web UI.
Clicking the note icon opens a notes panel in the central column: a **vertical note list
with a fuzzy search box**, and the selected note beside it.

Since 1.3.0 every save also writes the notes to **local Markdown files** via the Host half,
so the notes survive the page and can be read by tools and agents.

## What it registers

| Slot | Registration | Purpose |
| --- | --- | --- |
| `sidebar.panellist` | `id: "sidebar-notes"`, `order: 5` | The icon in the left sidebar. The shell owns the button, tooltip and active state; the plugin supplies the glyph and a localized label thunk. |
| `main` | `key: "sidebar-notes"` | The panel that the sidebar entry selects. Use **回到对话 / Back to chat** to return to the Conversation. |

Both registrations go through `ctx.slots.inject(...)`, so they are disposed when the
plugin is disabled and re-installed when the bundle is enabled again.

## Layout

```
┌─ header: title + description ───────────────────── [回到对话] ┐
│ ┌ 搜索框 ─────────────────────┐ ┌ 编辑器 ───────────────────┐ │
│ │ [搜索便签标题或内容      ×] │ │                          │ │
│ │ 3 / 12 个便签   [+ 新建便签] │ │  当前便签正文 …          │ │
│ │ ─────────────────────────── │ │                          │ │
│ │ ● 便签 A                    │ │                          │ │
│ │   命中片段…                 │ ├──────────────────────────┤ │
│ │   便签 B                    │ │ 字数 · 已保存 [复制][清空]│ │
│ │   便签 C                    │ │                          │ │
│ └─────────────────────────────┘ └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

On windows narrower than 880 px the two panes stack: search + list on top (capped at 42 %
height), editor below.

## Notes and search

- **+ 新建便签** adds a note at the top of the list (up to 40 notes) and clears the search.
- Click a row to select it; **double-click** (or `F2`) renames it, `Enter` commits, `Esc` cancels.
- **×** on a row deletes it; the footer offers **撤销 / Undo** for 6 s. Deleting the last
  remaining note clears it instead (the panel always keeps at least one note).
- **搜索框** does fuzzy matching over the note **title and body**:
  - an exact substring hit ranks highest;
  - otherwise the query characters may appear in order (subsequence), with extra weight for
    consecutive characters, word boundaries, and early hits — this also matches Chinese
    content, which has no word separators;
  - results are ordered by score; the matched characters are highlighted in the row title
    and in a body snippet around the first hit;
  - `Enter` opens the top result, `Esc` or `×` clears the search; the counter reads
    `visible / total`.
- **复制 / Copy** copies the selected note; **清空本页 / Clear this note** asks for a second
  click (4 s window) and only clears the selected note.

## Persistence (Host half, 1.3.0)

The Host half (`index.js`) exposes two same-origin JSON routes through
`ctx.connection.fetch`, which the panel calls with `fetch`:

| Route | Purpose |
| --- | --- |
| `/api/sidebarNotes.load` | Return `{ version, directory, document }`; `document` is `null` on first run. |
| `/api/sidebarNotes.save` | Accept `{ document }`, write it, and return `{ version, directory, files, document }`. |

Files written on every debounced save (350 ms):

- `state.json` — the exact panel document `{ activeId, notes: [{ id, title, body, createdAt, updatedAt }] }`;
- `<note title>--<note id>.md` — one Markdown file per note, with front matter
  (`id`, `title`, `created`, `updated`, JSON-quoted title) and the note body.

Removed notes have their `.md` files deleted. Files are written atomically
(`<file>.<pid>.<time>.tmp` then rename), and the panel reloads the Host copy on mount,
falling back to the browser's `localStorage` copy (`dsh.sidebar-notes.state.v1`) when the
Host copy is absent. The browser copy is still written on every save, and a footer warning
shows when the local Markdown write fails.

Notes directory, in order of precedence:

1. `DSH_SIDEBAR_NOTES_DIR` environment variable;
2. `D:\dsh\shared\notes` when the workspace exists on this machine;
3. `<home>/.dsh/sidebar-notes` otherwise.

Version 1.0.0 stored a single string under `dsh.sidebar-notes.text.v1`; that text is
migrated into the first note once, and the old key is left untouched. Version 1.1.0
already used the document shape, so no further migration is needed.

## Files

```
package.json       bundle manifest: dsh.bundle.patch + dsh.client (platform web)
cordis.patch.yml   inserts the row id "sidebar-notes"
index.js           Host half: local Markdown persistence + /api/sidebarNotes routes
client.js          Client half: dictionaries, icon, note list + search + editor, registrations
locale/en.json     Plugin Manager title/description (English)
locale/zh.json     Plugin Manager title/description (Chinese)
icon.svg           Original artwork for the Plugin Manager entry
```

## Install / update / remove

```powershell
# first install
plugin_manager install_bundle  target: D:\conversation-idea\dsh-plugin-sidebar-notes

# update after editing files: the package is already installed, so remove first
plugin_manager remove_bundle   target: @local/sidebar-notes
plugin_manager install_bundle  target: D:\conversation-idea\dsh-plugin-sidebar-notes

# remove
plugin_manager remove_bundle   target: @local/sidebar-notes
```

The profile links this directory (`link:D:/conversation-idea/dsh-plugin-sidebar-notes`),
so the installed package always reflects these files. Replacing the installed package
needs a page reload — and a DSH restart if the browser keeps the old module generation.
