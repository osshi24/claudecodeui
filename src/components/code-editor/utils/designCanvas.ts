/**
 * Support for design-canvas documents produced by the `/design` skill.
 *
 * A seeded canvas is a single self-contained HTML file (~2.4 MB) holding both
 * the document state and a precompiled visual editor. Opened as plain text it
 * is useless — and large enough to stall the code editor — so the app detects
 * one and hands it to an embedded editor instead.
 */

/** Both markers must be present; either alone is not a seeded canvas. */
const CANVAS_MARKERS = ['id="appifact-doc"', 'id="appifact-app"'];

const SHIM_ID = 'mangoads-canvas-shim';

/** Message channel between the sandboxed canvas and the embedding app. */
export const CANVAS_MESSAGE_SOURCE = 'mangoads-canvas';

export type CanvasMessage =
  | { source: typeof CANVAS_MESSAGE_SOURCE; type: 'ready' }
  | { source: typeof CANVAS_MESSAGE_SOURCE; type: 'save'; page: string }
  | { source: typeof CANVAS_MESSAGE_SOURCE; type: 'selection'; tag: string | null };

export type VisualEditorCommand =
  | { type: 'save' | 'delete' | 'duplicate' | 'undo' | 'redo' | 'edit-text' }
  | { type: 'style'; property: string; value: string };

export function isDesignCanvas(content: string | null | undefined): boolean {
  if (!content || content.length < 1000) {
    return false;
  }
  return CANVAS_MARKERS.every((marker) => content.includes(marker));
}

/**
 * The editor decides whether the document is writable by checking for
 * `window.claude.self.publish`. On claude.ai the Artifact runtime provides it;
 * embedded here nothing does, so the canvas would boot read-only. This shim
 * supplies the function and forwards each save to the app.
 *
 * `postMessage` is used rather than `fetch` on purpose: the iframe runs in an
 * opaque origin (`sandbox` without `allow-same-origin`), so canvas content
 * cannot reach the app's origin, cookies or auth token. The parent performs the
 * write with its own credentials.
 */
const SHIM = `<script id="${SHIM_ID}">
(function () {
  // The sandbox withholds 'allow-same-origin' so canvas content can never read
  // the app's origin or its stored auth token. The cost is that every storage
  // access THROWS, and the editor keeps UI state there — reading
  // "dc-editor-props-open-v2" is what opens the properties panel, and the throw
  // aborts that handler, so the panel silently never appears.
  // Hand it a working in-memory Storage instead of loosening the sandbox.
  function installMemoryStorage(name) {
    var data = Object.create(null);
    var api = {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, String(key)) ? data[String(key)] : null;
      },
      setItem: function (key, value) { data[String(key)] = String(value); },
      removeItem: function (key) { delete data[String(key)]; },
      clear: function () { data = Object.create(null); },
      key: function (index) { var keys = Object.keys(data); return index in keys ? keys[index] : null; },
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(data).length; } });
    try {
      Object.defineProperty(window, name, { value: api, configurable: true, writable: false });
    } catch (error) {
      // Nothing else to try; the editor degrades but still renders.
    }
  }

  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      window[name].getItem('mangoads-storage-probe');
    } catch (error) {
      installMemoryStorage(name);
    }
  });

  try {
    // The editor persists whether its properties panel is open, defaulting to
    // closed. Storage above is per-boot memory, so that default would win every
    // single time and the canvas would always open with the editing tools
    // hidden behind a chevron. Seed it open; the user can still collapse it.
    if (localStorage.getItem('dc-editor-props-open-v2') === null) {
      localStorage.setItem('dc-editor-props-open-v2', 'true');
    }
  } catch (error) {
    // Panel state is a convenience; the editor still works without it.
  }

  try {
    // A previous read-only boot leaves a flag that would keep the toolbar hidden.
    for (var i = sessionStorage.length - 1; i >= 0; i--) {
      var key = sessionStorage.key(i);
      if (key && key.indexOf('appifact-ro/') === 0) sessionStorage.removeItem(key);
    }
  } catch (error) {
    // Storage is optional for this cleanup; the shim above already covers it.
  }

  window.claude = window.claude || {};
  window.claude.self = {
    publish: async function (page) {
      var body = typeof page === 'string' ? page : JSON.stringify(page);
      // The editor rebuilds <head> from its template, so the page it hands back
      // no longer contains this shim. Re-insert it or the saved file reopens
      // read-only.
      var self = document.getElementById('${SHIM_ID}');
      if (self && body.indexOf('id="${SHIM_ID}"') < 0) {
        body = body.replace('<meta charset="utf-8">', '<meta charset="utf-8">\\n' + self.outerHTML + '\\n');
      }
      parent.postMessage({ source: '${CANVAS_MESSAGE_SOURCE}', type: 'save', page: body }, '*');
      // The editor ignores the resolved value and only treats a throw as failure.
      return { version: 1 };
    },
  };

  parent.postMessage({ source: '${CANVAS_MESSAGE_SOURCE}', type: 'ready' }, '*');
})();
</script>
`;

/**
 * Inserts the shim right after `<meta charset="utf-8">`, matching where the
 * canvas tooling expects it. Returns the input unchanged when the shim is
 * already present (a file saved from the app carries it).
 */
export function withCanvasEditShim(html: string): string {
  if (html.includes(`id="${SHIM_ID}"`)) {
    return html;
  }

  const charsetTag = '<meta charset="utf-8">';
  const at = html.indexOf(charsetTag);
  if (at < 0) {
    return html;
  }

  const cut = at + charsetTag.length;
  return `${html.slice(0, cut)}\n${SHIM}${html.slice(cut)}`;
}

const VISUAL_EDITOR_ID = 'mangoads-visual-editor';
const VISUAL_EDITOR_STYLE_ID = 'mangoads-visual-editor-style';

/**
 * Adds the small, provider-independent visual editing bridge used for ordinary
 * HTML files. The bridge lives inside the sandbox and only communicates with
 * the parent using postMessage, so generated page code never gains access to
 * the app origin or authentication state.
 */
export function withVisualEditorBridge(html: string): string {
  if (html.includes(`id="${VISUAL_EDITOR_ID}"`)) return html;

  const bridge = `<style id="${VISUAL_EDITOR_STYLE_ID}">[data-mangoads-selected="true"]{outline:2px solid #7c3aed!important;outline-offset:2px!important}</style>
<script id="${VISUAL_EDITOR_ID}">
(function () {
  var selected = null;
  var source = '${CANVAS_MESSAGE_SOURCE}';
  function send(type, extra) { parent.postMessage(Object.assign({ source: source, type: type }, extra || {}), '*'); }
  function clear() {
    if (!selected) return;
    selected.removeAttribute('data-mangoads-selected');
    selected = null;
  }
  function select(element) {
    clear();
    if (!element || element === document.documentElement || element === document.body) {
      send('selection', { tag: null }); return;
    }
    selected = element;
    selected.setAttribute('data-mangoads-selected', 'true');
    send('selection', { tag: selected.tagName.toLowerCase() });
  }
  function cleanPage() {
    var clone = document.documentElement.cloneNode(true);
    var bridge = clone.querySelector('#${VISUAL_EDITOR_ID}');
    if (bridge) bridge.remove();
    var editorStyle = clone.querySelector('#${VISUAL_EDITOR_STYLE_ID}');
    if (editorStyle) editorStyle.remove();
    clone.querySelectorAll('[data-mangoads-selected], [contenteditable]').forEach(function (node) {
      node.removeAttribute('data-mangoads-selected');
      node.removeAttribute('contenteditable');
    });
    return '<!doctype html>\\n' + clone.outerHTML;
  }
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('#${VISUAL_EDITOR_ID}')) return;
    event.preventDefault(); event.stopPropagation(); select(event.target);
  }, true);
  document.addEventListener('dblclick', function (event) {
    event.preventDefault(); event.stopPropagation(); select(event.target);
    if (selected) { selected.contentEditable = 'true'; selected.focus(); }
  }, true);
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); send('save', { page: cleanPage() });
    }
  }, true);
  window.addEventListener('message', function (event) {
    var command = event.data;
    if (!command || command.source !== source || command.type !== 'command') return;
    var action = command.command;
    if (action.type === 'save') send('save', { page: cleanPage() });
    else if (action.type === 'undo') document.execCommand('undo');
    else if (action.type === 'redo') document.execCommand('redo');
    else if (action.type === 'edit-text' && selected) { selected.contentEditable = 'true'; selected.focus(); }
    else if (action.type === 'delete' && selected) { var doomed = selected; clear(); doomed.remove(); send('selection', { tag: null }); }
    else if (action.type === 'duplicate' && selected) { var copy = selected.cloneNode(true); selected.after(copy); select(copy); }
    else if (action.type === 'style' && selected && typeof action.property === 'string') selected.style.setProperty(action.property, action.value || '');
  });
  send('ready');
})();
</script>`;

  const bodyClose = html.toLowerCase().lastIndexOf('</body>');
  if (bodyClose >= 0) return `${html.slice(0, bodyClose)}\n${bridge}\n${html.slice(bodyClose)}`;
  return `${html}\n${bridge}`;
}

/**
 * Recognises the one summary line `seed-canvas.mjs` prints on success:
 *
 *   wrote /path/to/poster.html — "Spring Menu Poster": 2 artboards (...), ...
 *
 * The canvas file is produced by that helper through Bash, never by the Write
 * tool, so watching file-write results would never see it. Matching the
 * helper's own output is both cheaper and more precise than reading candidate
 * files back to test them.
 *
 * Returns the absolute path, or null when the output is not a successful seed.
 */
export function findSeededCanvasPath(toolOutput: string | null | undefined): string | null {
  if (!toolOutput || !toolOutput.includes('wrote ')) {
    return null;
  }

  // The em dash and the quoted title are part of the helper's format; requiring
  // them keeps an unrelated "wrote ..." line from opening a random file.
  const match = /^wrote (.+?) — "/m.exec(toolOutput);
  const seededPath = match?.[1]?.trim();
  if (!seededPath || !seededPath.toLowerCase().endsWith('.html')) {
    return null;
  }

  return seededPath;
}

/**
 * Whether an HTML file still needs wrapping before the canvas editor can open it.
 *
 * Two suffixes are already canvas-side artefacts and must be left alone:
 * `.canvas.html` is a seeded canvas, and `.dc.html` is a single artboard whose
 * body is already an `<x-dc>` root. Wrapping either one nests an `<x-dc>` inside
 * an `<x-dc>`, and the editor then treats every string in the page as living in
 * a nested component — refusing to edit text in place.
 */
export function isWrappableHtml(path: string): boolean {
  return /\.html?$/i.test(path) && !/\.(canvas|dc)\.html?$/i.test(path);
}

/** Tool names whose successful result means an HTML file now exists on disk. */
const FILE_WRITING_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit', 'applypatch', 'patch']);

/**
 * Build output and dependencies are never hand-designed pages, and wrapping one
 * would write a 2.4 MB canvas next to it for nothing.
 */
const IGNORED_PATH_SEGMENTS = ['/node_modules/', '/dist/', '/build/', '/.git/', '/coverage/'];

/**
 * Decides whether a tool call just produced an HTML page worth offering as a
 * design canvas.
 *
 * Reads the tool's INPUT rather than its output: the write tools report success
 * in prose that differs per provider, while `file_path` is structured and
 * stable.
 */
export function findWrittenHtmlPath(
  toolName: string | null | undefined,
  toolInput: unknown,
): string | null {
  if (!toolName || !FILE_WRITING_TOOLS.has(toolName.toLowerCase())) {
    return null;
  }

  const input = toolInput as { file_path?: unknown; filePath?: unknown } | null;
  const raw = input?.file_path ?? input?.filePath;
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }

  const filePath = raw.trim();
  if (!/\.html?$/i.test(filePath)) {
    return null;
  }

  const normalized = filePath.replace(/\\/g, '/');
  if (IGNORED_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) {
    return null;
  }

  return filePath;
}

/** Extracts HTML paths from provider-native batched file-change payloads. */
export function findChangedHtmlPaths(input: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const candidate = value.trim();
      if (/\.html?$/i.test(candidate) && !IGNORED_PATH_SEGMENTS.some((part) => candidate.replace(/\\/g, '/').includes(part))) found.add(candidate);
      return;
    }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const key of ['path', 'file_path', 'filePath', 'filename']) visit(record[key]);
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested);
    }
  };
  visit(input);
  return [...found];
}
