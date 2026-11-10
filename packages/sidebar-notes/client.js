/**
 * Client half of the Sidebar Notes bundle.
 *
 * Registers two things against the live slot tree:
 *   - `sidebar.panellist`  the entry id in the left sidebar (the shell owns the button);
 *   - `main`               the panel that entry id selects in the central column.
 *
 * The panel is a two-pane notes app: a vertical note list with a fuzzy search box on the
 * left, the selected note on the right. The note set persists in this browser as one JSON
 * document. Styling uses only theme alias tokens, and the stylesheet rides inside the panel
 * as a React element, so unmounting removes it together with the panel.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-sidebar-notes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-sidebar-notes';
    /** Current persisted state: { activeId, notes: [{ id, title, body, createdAt }] }. */
    const STATE_KEY = 'dsh.sidebar-notes.state.v1';
    /** Previous single-note format, migrated into the first note on first run. */
    const LEGACY_KEY = 'dsh.sidebar-notes.text.v1';
    /** Sidebar entry id; the `main` cell key must be identical. */
    const PANEL_ID = 'sidebar-notes';
    const MAX_NOTES = 40;
    /** Document-relative base of the Host notes API (see index.js). */
    const API_BASE = 'api/sidebarNotes';

    const EN = {
      title: 'Sidebar Notes',
      label: 'Sidebar Notes',
      description: 'Vertical notes with fuzzy search over titles and content. Saves automatically to local Markdown files and this browser.',
      backToChat: 'Back to chat',
      placeholder: 'Jot something down. It saves automatically.',
      noteLabel: 'Note',
      newNote: 'New note',
      deleteNote: 'Delete note',
      deleted: 'Note deleted',
      undo: 'Undo',
      renameHint: 'Double-click to rename',
      searchPlaceholder: 'Search notes by title or content',
      clearSearch: 'Clear search',
      noMatches: 'No matching notes',
      countSuffix: 'notes',
      copy: 'Copy',
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed, select the text and copy it manually',
      clear: 'Clear this note',
      confirmClear: 'Confirm clear',
      cleared: 'Note cleared',
      word: 'characters',
      saved: 'Saved',
      saving: 'Saving…',
      tooMany: 'That is the last free note; delete one to add another.',
      storageBlocked: 'This browser blocked local storage, so notes only last until the page closes.',
      fileError: 'Could not write the local Markdown files; the text stays in this browser for now.',
    };

    const ZH = {
      title: '侧栏便签',
      label: '侧栏便签',
      description: '便签纵向排列，可按标题和内容模糊搜索；自动保存到本机 Markdown 文件和浏览器。',
      backToChat: '回到对话',
      placeholder: '随手记点什么，内容会自动保存。',
      noteLabel: '便签',
      newNote: '新建便签',
      deleteNote: '删除便签',
      deleted: '便签已删除',
      undo: '撤销',
      renameHint: '双击重命名',
      searchPlaceholder: '搜索便签标题或内容',
      clearSearch: '清除搜索',
      noMatches: '没有匹配的便签',
      countSuffix: '个便签',
      copy: '复制',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请选中文字手动复制',
      clear: '清空本页',
      confirmClear: '确认清空',
      cleared: '本页已清空',
      word: '字',
      saved: '已保存',
      saving: '保存中…',
      tooMany: '便签数量已达上限，删掉一个再新建。',
      storageBlocked: '浏览器拒绝了本地存储，内容只在关闭页面之前有效。',
      fileError: '本地 Markdown 文件写入失败，内容暂时只保存在浏览器里。',
    };

    const CSS = [
      '.dsh-notes-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;height:100%;padding:22px 28px 26px;',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;overflow:hidden}',
      '.dsh-notes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}',
      '.dsh-notes-heading{display:flex;align-items:flex-start;gap:12px;min-width:0}',
      '.dsh-notes-badge{display:flex;flex:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-title{margin:0;font-size:18px;font-weight:600;line-height:24px;letter-spacing:-.01em}',
      '.dsh-notes-desc{margin:4px 0 0;max-width:62ch;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-btn{flex:none;font:inherit;font-size:13px;line-height:20px;padding:5px 12px;border-radius:8px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-notes-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-btn:active{transform:translateY(1px)}',
      '.dsh-notes-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-notes-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-btn--ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-btn--danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dsh-notes-body{display:flex;flex:1 1 auto;gap:14px;min-height:0}',
      '.dsh-notes-list-pane{display:flex;flex:none;flex-direction:column;gap:8px;width:284px;min-height:0}',
      '.dsh-notes-search{display:flex;flex:none;align-items:center;gap:6px;height:34px;padding:0 8px 0 10px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);',
      'transition:border-color .15s ease}',
      '.dsh-notes-search:focus-within{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-search-icon{display:flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-search-input{flex:1 1 auto;min-width:0;padding:0;border:0;outline:0;background:transparent;color:inherit;',
      'font:inherit;font-size:13px;line-height:20px;-webkit-appearance:none;appearance:none}',
      '.dsh-notes-search-input::-webkit-search-cancel-button,.dsh-notes-search-input::-webkit-search-decoration{display:none}',
      '.dsh-notes-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dsh-notes-search-clear{display:flex;flex:none;align-items:center;justify-content:center;width:18px;height:18px;padding:0;',
      'border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer}',
      '.dsh-notes-search-clear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-list-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;padding:0 2px;',
      'font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-notes-add{display:flex;flex:none;align-items:center;gap:4px;padding:2px 8px;border:1px dashed var(--dsw-alias-border-l1);',
      'border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;',
      'transition:color .15s ease,border-color .15s ease,background-color .15s ease}',
      '.dsh-notes-add:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-add:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-notes-list{display:flex;flex:1 1 auto;flex-direction:column;gap:2px;min-height:0;overflow-y:auto;padding-right:2px}',
      '.dsh-notes-row{position:relative;display:flex;flex-direction:column;gap:2px;padding:7px 10px;border:1px solid transparent;',
      'border-radius:9px;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}',
      '.dsh-notes-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-notes-row--active{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-row-title{padding-right:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-row-snippet{padding-right:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-row mark{background:transparent;color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-notes-row-close{position:absolute;top:5px;right:3px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;',
      'padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;',
      'cursor:pointer;opacity:0;transition:opacity .15s ease,background-color .15s ease,color .15s ease}',
      '.dsh-notes-row:hover .dsh-notes-row-close,.dsh-notes-row--active .dsh-notes-row-close,.dsh-notes-row-close:focus-visible{opacity:.6}',
      '.dsh-notes-row-close:hover{opacity:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}',
      '.dsh-notes-row-input{box-sizing:border-box;width:100%;padding:0 0 1px;border:0;border-bottom:1px solid var(--dsw-alias-brand-primary);',
      'background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;outline:none}',
      '.dsh-notes-empty{padding:20px 10px;font-size:12px;line-height:18px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-editor{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;overflow:hidden;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-input{box-sizing:border-box;flex:1 1 auto;width:100%;min-height:120px;padding:16px 18px;resize:none;',
      'border:0;outline:0;background:transparent;color:inherit;font-family:inherit;font-size:14px;line-height:23px}',
      '.dsh-notes-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.72}',
      '.dsh-notes-bar{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px 9px 18px;',
      'border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-meta{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-notes-dot{opacity:.5}',
      '.dsh-notes-flash{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dsh-notes-flash--ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-notes-flash--warn{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-notes-undo{padding:0 4px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-brand-primary);',
      'font:inherit;font-size:12px;line-height:18px;cursor:pointer;text-decoration:underline}',
      '.dsh-notes-actions{display:flex;flex:none;align-items:center;gap:8px}',
      '.dsh-notes-warn{margin:-6px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary)}',
      '@media (max-width:880px){.dsh-notes-root{padding:18px 16px 22px}.dsh-notes-head{flex-direction:column}',
      '.dsh-notes-body{flex-direction:column}.dsh-notes-list-pane{width:auto;max-height:42%}}',
    ].join('');

    const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const makeNote = (title, body) => ({
      id: newId(),
      title: title,
      body: body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    function readStoredString(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function writeStored(value) {
      try {
        window.localStorage.setItem(STATE_KEY, value);
        return true;
      } catch (error) {
        return false;
      }
    }

    function hasStored() {
      return readStoredString(STATE_KEY) !== null;
    }

    /** Call one Host operation; resolves the parsed JSON or throws. */
    async function callApi(operation, payload) {
      const url = new URL(API_BASE + '.' + operation, document.baseURI);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload || {}),
      });
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      if (!response.ok) throw new Error((data && data.error) || 'HTTP ' + response.status);
      return data || {};
    }

    /** Accept only a well-formed document; anything else is rebuilt from scratch. */
    function normalizeDocument(value) {
      if (!value || typeof value !== 'object' || !Array.isArray(value.notes)) return null;
      const notes = [];
      for (const candidate of value.notes) {
        if (!candidate || typeof candidate !== 'object') continue;
        notes.push({
          id: typeof candidate.id === 'string' && candidate.id ? candidate.id : newId(),
          title: typeof candidate.title === 'string' ? candidate.title : '',
          body: typeof candidate.body === 'string' ? candidate.body : '',
          createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
          updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
        });
        if (notes.length >= MAX_NOTES) break;
      }
      if (notes.length === 0) return null;
      const wanted = typeof value.activeId === 'string' ? value.activeId : '';
      const activeId = notes.some((note) => note.id === wanted) ? wanted : notes[0].id;
      return { activeId: activeId, notes: notes };
    }

    const BOUNDARY = /[\s\p{P}\p{S}]/u;

    /**
     * Fuzzy match: an exact substring wins, otherwise the query characters must appear in
     * order (a subsequence). Consecutive and word-boundary hits score higher, and earlier
     * hits beat later ones. Works for CJK too, since it never needs word separation.
     * Returns null when the query does not match at all.
     */
    function fuzzy(lowerQuery, text) {
      if (!lowerQuery) return { score: 0, indices: [] };
      const lower = text.toLowerCase();
      const exact = lower.indexOf(lowerQuery);
      if (exact >= 0) {
        const indices = [];
        for (let i = 0; i < lowerQuery.length; i++) indices.push(exact + i);
        return { score: 1000 + lowerQuery.length * 10 - Math.min(exact, 60), indices: indices };
      }
      let queryIndex = 0;
      let lastHit = -1;
      let score = 0;
      const indices = [];
      for (let i = 0; i < lower.length && queryIndex < lowerQuery.length; i++) {
        if (lower[i] !== lowerQuery[queryIndex]) continue;
        score += 1;
        if (i === lastHit + 1) score += 4;
        if (i === 0 || BOUNDARY.test(lower[i - 1])) score += 3;
        indices.push(i);
        lastHit = i;
        queryIndex++;
      }
      if (queryIndex < lowerQuery.length) return null;
      score += Math.max(0, 20 - Math.floor(indices[0] / 5));
      return { score: score, indices: indices };
    }

    /** Score one note; null means it is filtered out. */
    function matchNote(lowerQuery, note) {
      const titleMatch = fuzzy(lowerQuery, note.title || '');
      const bodyMatch = fuzzy(lowerQuery, note.body || '');
      if (!titleMatch && !bodyMatch) return null;
      const score = (titleMatch ? titleMatch.score * 3 : 0) + (bodyMatch ? bodyMatch.score : 0);
      return {
        score: score,
        titleMarks: titleMatch ? titleMatch.indices : [],
        bodyMarks: bodyMatch ? bodyMatch.indices : [],
      };
    }

    /** One-line preview around the first body hit, with marks shifted into that window. */
    function buildSnippet(body, bodyMarks) {
      if (!body) return null;
      const maxLength = 96;
      if (bodyMarks.length === 0) {
        const text = body.slice(0, maxLength);
        return { text: text + (body.length > maxLength ? '…' : ''), marks: [] };
      }
      const start = Math.max(0, bodyMarks[0] - 28);
      const end = Math.min(body.length, start + maxLength);
      const prefix = start > 0 ? '…' : '';
      const offset = prefix.length - start;
      const text = prefix + body.slice(start, end) + (end < body.length ? '…' : '');
      const marks = [];
      for (const index of bodyMarks) {
        if (index >= start && index < end) marks.push(index + offset);
      }
      return { text: text, marks: marks };
    }

    /** Wrap matched characters in <mark> so a hit is visible inside the row. */
    function renderMarked(text, marks) {
      if (!marks || marks.length === 0) return text;
      const flagged = new Set(marks);
      const parts = [];
      let buffer = '';
      let bufferMarked = false;
      let key = 0;
      for (let i = 0; i < text.length; i++) {
        const marked = flagged.has(i);
        if (marked !== bufferMarked && buffer !== '') {
          parts.push(h(bufferMarked ? 'mark' : 'span', { key: key++ }, buffer));
          buffer = '';
        }
        bufferMarked = marked;
        buffer += text[i];
      }
      if (buffer !== '') parts.push(h(bufferMarked ? 'mark' : 'span', { key: key++ }, buffer));
      return parts;
    }

    function SearchIcon(props) {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'M15.5 15.5 20 20' }),
      );
    }

    /** The sidebar entry glyph: original artwork, colored by the surrounding control. */
    function NotesIcon(props) {
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
        h('path', { d: 'M5 3.75h9.5L19 8.25v12H5z' }),
        h('path', { d: 'M14.5 3.75v4.5H19' }),
        h('path', { d: 'M8.25 12.5h7.5' }),
        h('path', { d: 'M8.25 16h4.75' }),
      );
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        // Register one dictionary per built-in locale: Chinese locales get ZH, English
        // locales get EN, and anything else keeps the English defaults below.
        ctx.effect(() => {
          const disposers = [];
          const register = (id, dict) => {
            try {
              disposers.push(ctx.locale.register(NS, id, dict));
            } catch (error) {
              console.error('[sidebar-notes] locale registration failed for ' + id, error);
            }
          };
          try {
            for (const definition of ctx.locale.getLocale().locales) {
              if (/^zh/i.test(definition.id)) register(definition.id, ZH);
              else if (/^en/i.test(definition.id)) register(definition.id, EN);
            }
          } catch (error) {
            console.error('[sidebar-notes] reading the locale catalog failed', error);
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
        // The dictionaries above are registered on the same tick, but stay readable even
        // if a registration was refused: fall back to the built-in English text.
        const tr = (key) => {
          const value = translate(key);
          if (typeof value === 'string' && value !== key) return value;
          return Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key;
        };

        /** First run: migrate the old single note, otherwise start with one empty note. */
        function initialState() {
          const raw = readStoredString(STATE_KEY);
          if (raw) {
            try {
              const normalized = normalizeDocument(JSON.parse(raw));
              if (normalized) return normalized;
            } catch (error) {
              console.error('[sidebar-notes] stored notes were unreadable; starting fresh', error);
            }
          }
          const legacy = readStoredString(LEGACY_KEY);
          const first = makeNote(tr('noteLabel') + ' 1', typeof legacy === 'string' ? legacy : '');
          return { activeId: first.id, notes: [first] };
        }

        function NotesPanel() {
          // Re-render on locale switches: `tr` reads the active locale at call time.
          const [, setLocaleRevision] = React.useState(0);
          React.useEffect(
            () => ctx.locale.subscribe(() => setLocaleRevision((value) => value + 1)),
            [],
          );

          const [document, setDocument] = React.useState(initialState);
          const [dirty, setDirty] = React.useState(false);
          const [storageBlocked, setStorageBlocked] = React.useState(false);
          const [fileError, setFileError] = React.useState(false);
          const [flash, setFlash] = React.useState(null);
          const [confirmClear, setConfirmClear] = React.useState(false);
          const [renamingId, setRenamingId] = React.useState(null);
          const [renameDraft, setRenameDraft] = React.useState('');
          const [undoEntry, setUndoEntry] = React.useState(null);
          const [search, setSearch] = React.useState('');

          const latest = React.useRef(document);
          latest.current = document;
          const flashTimer = React.useRef(0);
          const clearTimer = React.useRef(0);
          const undoTimer = React.useRef(0);

          const current = document.notes.find((note) => note.id === document.activeId) || document.notes[0];

          const announce = (kind, key) => {
            setFlash({ kind: kind, text: tr(key) });
            window.clearTimeout(flashTimer.current);
            flashTimer.current = window.setTimeout(() => setFlash(null), 2400);
          };

          const commit = (next) => {
            setDocument(next);
            setDirty(true);
          };

          // First run writes the migrated document once, so later visits never re-migrate.
          React.useEffect(() => {
            if (!hasStored()) setStorageBlocked(!writeStored(JSON.stringify(latest.current)));
          }, []);

          // Prefer the Host copy (local Markdown files) over this browser's copy.
          React.useEffect(() => {
            let cancelled = false;
            callApi('load', {})
              .then((data) => {
                if (cancelled) return;
                const remote = data && data.document ? normalizeDocument(data.document) : null;
                if (remote) {
                  latest.current = remote;
                  setDocument(remote);
                  writeStored(JSON.stringify(remote));
                  setDirty(false);
                  setFileError(false);
                } else {
                  // First run after the upgrade: mirror the browser copy to disk.
                  callApi('save', { document: latest.current }).catch(() => setFileError(true));
                }
              })
              .catch(() => {
                if (!cancelled) setFileError(true);
              });
            return () => {
              cancelled = true;
            };
          }, []);

          // Debounced autosave: this browser plus the Host's local Markdown files.
          React.useEffect(() => {
            if (!dirty) return undefined;
            const timer = window.setTimeout(() => {
              const snapshot = latest.current;
              setStorageBlocked(!writeStored(JSON.stringify(snapshot)));
              setDirty(false);
              callApi('save', { document: snapshot })
                .then(() => setFileError(false))
                .catch(() => setFileError(true));
            }, 350);
            return () => window.clearTimeout(timer);
          }, [document, dirty]);

          // Last-chance save plus timer cleanup when the panel collapses.
          React.useEffect(
            () => () => {
              writeStored(JSON.stringify(latest.current));
              callApi('save', { document: latest.current }).catch(() => undefined);
              window.clearTimeout(flashTimer.current);
              window.clearTimeout(clearTimer.current);
              window.clearTimeout(undoTimer.current);
            },
            [],
          );

          const lowerQuery = search.trim().toLowerCase();
          const rows = [];
          if (lowerQuery) {
            const scored = [];
            for (let index = 0; index < document.notes.length; index++) {
              const match = matchNote(lowerQuery, document.notes[index]);
              if (match) scored.push({ note: document.notes[index], index: index, match: match });
            }
            scored.sort((left, right) => right.match.score - left.match.score || left.index - right.index);
            for (const entry of scored) rows.push(entry);
          } else {
            for (let index = 0; index < document.notes.length; index++) {
              rows.push({ note: document.notes[index], index: index, match: null });
            }
          }

          const selectNote = (id) => {
            if (!document.notes.some((note) => note.id === id)) return;
            setConfirmClear(false);
            if (document.activeId !== id) commit({ activeId: id, notes: document.notes });
          };

          const addNote = () => {
            if (document.notes.length >= MAX_NOTES) {
              announce('warn', 'tooMany');
              return;
            }
            const note = makeNote(tr('noteLabel') + ' ' + (document.notes.length + 1), '');
            setSearch('');
            setConfirmClear(false);
            commit({ activeId: note.id, notes: [note].concat(document.notes) });
          };

          const removeNote = (id) => {
            if (document.notes.length <= 1) {
              commit({ activeId: document.activeId, notes: document.notes.map((note) => (note.id === id ? { ...note, body: '', updatedAt: Date.now() } : note)) });
              announce('ok', 'cleared');
              return;
            }
            const index = document.notes.findIndex((note) => note.id === id);
            if (index < 0) return;
            const removed = document.notes[index];
            const notes = document.notes.filter((note) => note.id !== id);
            const activeId = document.activeId === id ? notes[Math.max(0, index - 1)].id : document.activeId;
            setUndoEntry({ note: removed, index: index });
            window.clearTimeout(undoTimer.current);
            undoTimer.current = window.setTimeout(() => setUndoEntry(null), 6000);
            if (renamingId === id) setRenamingId(null);
            setConfirmClear(false);
            commit({ activeId: activeId, notes: notes });
            announce('ok', 'deleted');
          };

          const undoRemove = () => {
            if (!undoEntry) return;
            const notes = latest.current.notes.slice();
            notes.splice(Math.min(undoEntry.index, notes.length), 0, undoEntry.note);
            setUndoEntry(null);
            window.clearTimeout(undoTimer.current);
            commit({ activeId: undoEntry.note.id, notes: notes });
          };

          const startRename = (note) => {
            setRenamingId(note.id);
            setRenameDraft(note.title || '');
          };

          const finishRename = () => {
            if (!renamingId) return;
            const title = renameDraft.trim();
            setRenamingId(null);
            if (!title) return;
            commit({
              activeId: latest.current.activeId,
              notes: latest.current.notes.map((note) => (note.id === renamingId ? { ...note, title: title, updatedAt: Date.now() } : note)),
            });
          };

          const copy = () => {
            const body = current.body;
            const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
            if (!clipboard || typeof clipboard.writeText !== 'function') {
              announce('warn', 'copyFailed');
              return;
            }
            clipboard.writeText(body).then(
              () => announce('ok', 'copied'),
              () => announce('warn', 'copyFailed'),
            );
          };

          const clear = () => {
            if (!confirmClear) {
              setConfirmClear(true);
              window.clearTimeout(clearTimer.current);
              clearTimer.current = window.setTimeout(() => setConfirmClear(false), 4000);
              return;
            }
            window.clearTimeout(clearTimer.current);
            setConfirmClear(false);
            commit({
              activeId: document.activeId,
              notes: document.notes.map((note) => (note.id === current.id ? { ...note, body: '', updatedAt: Date.now() } : note)),
            });
            announce('ok', 'cleared');
          };

          const backToChat = () => {
            try {
              ctx.layout.selectPanel(null);
            } catch (error) {
              console.error('[sidebar-notes] switching back to the conversation failed', error);
            }
          };

          const noteRows = rows.map((entry) => {
            const note = entry.note;
            const active = note.id === current.id;
            const renaming = note.id === renamingId;
            const snippet = buildSnippet(note.body, entry.match ? entry.match.bodyMarks : []);
            const titleText = note.title || tr('noteLabel');
            return h(
              'div',
              {
                key: note.id,
                role: 'button',
                tabIndex: 0,
                'aria-current': active ? 'true' : undefined,
                title: tr('renameHint'),
                className: active ? 'dsh-notes-row dsh-notes-row--active' : 'dsh-notes-row',
                onClick: () => {
                  if (!renaming) selectNote(note.id);
                },
                onDoubleClick: () => startRename(note),
                onKeyDown: (event) => {
                  if (renaming) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectNote(note.id);
                  } else if (event.key === 'F2') {
                    event.preventDefault();
                    startRename(note);
                  }
                },
              },
              renaming
                ? h('input', {
                    className: 'dsh-notes-row-input',
                    value: renameDraft,
                    autoFocus: true,
                    'aria-label': tr('renameHint'),
                    onChange: (event) => setRenameDraft(event.target.value),
                    onBlur: finishRename,
                    onClick: (event) => event.stopPropagation(),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        finishRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setRenamingId(null);
                      }
                    },
                  })
                : h('div', { className: 'dsh-notes-row-title' }, renderMarked(titleText, entry.match ? entry.match.titleMarks : [])),
              renaming || !snippet
                ? null
                : h('div', { className: 'dsh-notes-row-snippet' }, renderMarked(snippet.text, snippet.marks)),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-notes-row-close',
                  title: tr('deleteNote'),
                  'aria-label': tr('deleteNote'),
                  onClick: (event) => {
                    event.stopPropagation();
                    removeNote(note.id);
                  },
                },
                '×',
              ),
            );
          });

          const listHead = h(
            'div',
            { className: 'dsh-notes-list-head' },
            h(
              'span',
              null,
              lowerQuery
                ? rows.length + ' / ' + document.notes.length + ' ' + tr('countSuffix')
                : document.notes.length + ' ' + tr('countSuffix'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsh-notes-add', title: tr('newNote'), onClick: addNote },
              '+ ' + tr('newNote'),
            ),
          );

          return h(
            React.Fragment,
            null,
            h('style', { key: 'notes-style' }, CSS),
            h(
              'div',
              { className: 'dsh-notes-root' },
              h(
                'header',
                { className: 'dsh-notes-head' },
                h(
                  'div',
                  { className: 'dsh-notes-heading' },
                  h('div', { className: 'dsh-notes-badge' }, h(NotesIcon, { size: 20, active: true })),
                  h(
                    'div',
                    null,
                    h('h1', { className: 'dsh-notes-title' }, tr('title')),
                    h('p', { className: 'dsh-notes-desc' }, tr('description')),
                  ),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsh-notes-btn dsh-notes-btn--ghost', onClick: backToChat },
                  tr('backToChat'),
                ),
              ),
              h(
                'div',
                { className: 'dsh-notes-body' },
                h(
                  'aside',
                  { className: 'dsh-notes-list-pane' },
                  h(
                    'div',
                    { className: 'dsh-notes-search' },
                    h('span', { className: 'dsh-notes-search-icon' }, h(SearchIcon, null)),
                    h('input', {
                      className: 'dsh-notes-search-input',
                      type: 'search',
                      value: search,
                      placeholder: tr('searchPlaceholder'),
                      autoComplete: 'off',
                      'aria-label': tr('searchPlaceholder'),
                      onChange: (event) => setSearch(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setSearch('');
                        } else if (event.key === 'Enter' && rows.length > 0) {
                          event.preventDefault();
                          selectNote(rows[0].note.id);
                        }
                      },
                    }),
                    search
                      ? h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-notes-search-clear',
                            title: tr('clearSearch'),
                            'aria-label': tr('clearSearch'),
                            onClick: () => setSearch(''),
                          },
                          '×',
                        )
                      : null,
                  ),
                  listHead,
                  h(
                    'div',
                    { className: 'dsh-notes-list', role: 'group', 'aria-label': tr('title') },
                    noteRows.length === 0
                      ? h('div', { className: 'dsh-notes-empty' }, tr('noMatches'))
                      : noteRows,
                  ),
                ),
                h(
                  'section',
                  { className: 'dsh-notes-editor', role: 'region', 'aria-label': current.title || tr('noteLabel') },
                  h('textarea', {
                    className: 'dsh-notes-input',
                    value: current.body,
                    placeholder: tr('placeholder'),
                    spellCheck: true,
                    'aria-label': current.title || tr('noteLabel'),
                    onChange: (event) => {
                      const body = event.target.value;
                      commit({
                        activeId: document.activeId,
                        notes: document.notes.map((note) => (note.id === current.id ? { ...note, body: body, updatedAt: Date.now() } : note)),
                      });
                    },
                  }),
                  h(
                    'div',
                    { className: 'dsh-notes-bar' },
                    h(
                      'div',
                      { className: 'dsh-notes-meta' },
                      h('span', null, current.body.length + ' ' + tr('word')),
                      h('span', { className: 'dsh-notes-dot', 'aria-hidden': true }, '·'),
                      h('span', null, dirty ? tr('saving') : tr('saved')),
                      undoEntry
                        ? h('button', { type: 'button', className: 'dsh-notes-undo', onClick: undoRemove }, tr('undo'))
                        : null,
                      flash
                        ? h('span', { className: 'dsh-notes-flash dsh-notes-flash--' + flash.kind, role: 'status' }, flash.text)
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'dsh-notes-actions' },
                      h('button', { type: 'button', className: 'dsh-notes-btn', onClick: copy }, tr('copy')),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: confirmClear ? 'dsh-notes-btn dsh-notes-btn--danger' : 'dsh-notes-btn',
                          onClick: clear,
                        },
                        confirmClear ? tr('confirmClear') : tr('clear'),
                      ),
                    ),
                  ),
                ),
              ),
              storageBlocked ? h('p', { className: 'dsh-notes-warn' }, tr('storageBlocked')) : null,
              fileError ? h('p', { className: 'dsh-notes-warn' }, tr('fileError')) : null,
            ),
          );
        }

        // The sidebar entry: its id is also the `main` cell key the shell dispatches.
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: () => tr('label') },
            NotesIcon,
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, NotesPanel),
        );
      },
    };
  },
});
