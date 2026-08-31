import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findChangedHtmlPaths,
  findSeededCanvasPath,
  findWrittenHtmlPath,
  isDesignCanvas,
  isWrappableHtml,
  withCanvasEditShim,
  withVisualEditorBridge,
} from './designCanvas';

/** Mirrors the shape `seed-canvas.mjs` writes, trimmed to what detection reads. */
const seededCanvas = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<title>Test Canvas</title>',
  '<style id="appifact-style"></style>',
  '</head><body>',
  `<script id="appifact-doc">${'x'.repeat(1200)}</script>`,
  '<script id="appifact-app">/* editor */</script>',
  '</body></html>',
].join('\n');

test('a seeded canvas is recognised', () => {
  assert.equal(isDesignCanvas(seededCanvas), true);
});

test('an ordinary HTML page is not a canvas', () => {
  const page = `<!doctype html><html><head><meta charset="utf-8"></head><body>${'x'.repeat(2000)}</body></html>`;
  assert.equal(isDesignCanvas(page), false);
});

test('one marker alone is not enough', () => {
  // A page that merely mentions the document block — e.g. this repo's own
  // documentation — must not be hijacked by the canvas editor.
  const halfMatch = `<html><body>id="appifact-doc"${'x'.repeat(2000)}</body></html>`;
  assert.equal(isDesignCanvas(halfMatch), false);
});

test('empty and tiny inputs are rejected without scanning', () => {
  assert.equal(isDesignCanvas(''), false);
  assert.equal(isDesignCanvas(null), false);
  assert.equal(isDesignCanvas(undefined), false);
  assert.equal(isDesignCanvas('id="appifact-doc" id="appifact-app"'), false);
});

test('the shim is inserted immediately after the charset tag', () => {
  const shimmed = withCanvasEditShim(seededCanvas);
  const charsetAt = shimmed.indexOf('<meta charset="utf-8">');
  const shimAt = shimmed.indexOf('id="mangoads-canvas-shim"');

  assert.ok(shimAt > charsetAt, 'shim must follow the charset tag');
  assert.ok(shimAt - charsetAt < 200, 'shim must sit directly after it, not later in the document');
});

test('the shim defines the hook the editor checks for writability', () => {
  const shimmed = withCanvasEditShim(seededCanvas);

  assert.match(shimmed, /window\.claude\.self\s*=/);
  assert.match(shimmed, /publish:/);
});

test('injecting twice does not duplicate the shim', () => {
  const once = withCanvasEditShim(seededCanvas);
  const twice = withCanvasEditShim(once);

  assert.equal(twice, once);
});

test('a page without a charset tag is returned untouched', () => {
  const noCharset = '<html><head></head><body>id="appifact-doc" id="appifact-app"</body></html>';
  assert.equal(withCanvasEditShim(noCharset), noCharset);
});

const seedOutput =
  'wrote /work/spring-menu-poster.html — "Spring Menu Poster": 2 artboards (Main.dc.html, Pricing.dc.html), 1 image, canvas.json';

test('the seed helper summary yields the canvas path', () => {
  assert.equal(findSeededCanvasPath(seedOutput), '/work/spring-menu-poster.html');
});

test('warnings printed before the summary do not confuse the match', () => {
  const withWarnings = [
    'design canvas: warning — no --artboard is Main.dc.html',
    seedOutput,
  ].join('\n');

  assert.equal(findSeededCanvasPath(withWarnings), '/work/spring-menu-poster.html');
});

test('unrelated output that merely contains "wrote" is ignored', () => {
  assert.equal(findSeededCanvasPath('wrote 42 rows to the database'), null);
  assert.equal(findSeededCanvasPath('The compiler wrote /tmp/out.html to disk'), null);
  assert.equal(findSeededCanvasPath('ok: poster.html — title "x", 1 files'), null);
  assert.equal(findSeededCanvasPath(''), null);
  assert.equal(findSeededCanvasPath(null), null);
});

test('a seed that produced something other than html is ignored', () => {
  assert.equal(findSeededCanvasPath('wrote /work/notes.txt — "Notes": 1 artboard'), null);
});

test('a written HTML page is offered as a canvas', () => {
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/work/poster.html' }), '/work/poster.html');
  assert.equal(findWrittenHtmlPath('Edit', { file_path: '/work/report.HTM' }), '/work/report.HTM');
});

test('non-HTML writes and non-writing tools are ignored', () => {
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/work/index.ts' }), null);
  assert.equal(findWrittenHtmlPath('Read', { file_path: '/work/poster.html' }), null);
  assert.equal(findWrittenHtmlPath('Bash', { command: 'ls' }), null);
  assert.equal(findWrittenHtmlPath(null, { file_path: '/work/poster.html' }), null);
  assert.equal(findWrittenHtmlPath('Write', null), null);
  assert.equal(findWrittenHtmlPath('Write', { file_path: '   ' }), null);
});

test('generated and vendored trees never trigger a wrap', () => {
  // Each would otherwise leave a 2.4 MB canvas beside a file nobody designed.
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/w/node_modules/x/a.html' }), null);
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/w/dist/index.html' }), null);
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/w/build/index.html' }), null);
  assert.equal(findWrittenHtmlPath('Write', { file_path: '/w/coverage/lcov/index.html' }), null);
});

test('ordinary HTML receives one removable visual-editor bridge', () => {
  const page = '<!doctype html><html><body><main>Hello</main></body></html>';
  const once = withVisualEditorBridge(page);
  assert.match(once, /id="mangoads-visual-editor"/);
  assert.ok(once.indexOf('mangoads-visual-editor') < once.indexOf('</body>'));
  assert.equal(withVisualEditorBridge(once), once);
  assert.match(once, /cleanPage/);
});

test('batched provider file changes yield only source HTML paths', () => {
  assert.deepEqual(findChangedHtmlPaths({ changes: [
    { path: '/work/index.html', kind: 'update' },
    { file_path: '/work/page.HTM' },
    { path: '/work/app.ts' },
    { path: '/work/dist/generated.html' },
  ] }), ['/work/index.html', '/work/page.HTM']);
});

test('write-tool matching is provider-case agnostic', () => {
  assert.equal(findWrittenHtmlPath('write', { filePath: '/work/index.html' }), '/work/index.html');
  assert.equal(findWrittenHtmlPath('ApplyPatch', { path: '/work/index.html' }), null);
});

test('the canvas shim installs storage the sandbox would otherwise deny', () => {
  // Without this the editor's read of "dc-editor-props-open-v2" throws and the
  // properties panel never opens inside the app's sandboxed iframe.
  const shimmed = withCanvasEditShim(seededCanvas);

  assert.match(shimmed, /installMemoryStorage/);
  assert.match(shimmed, /'localStorage', 'sessionStorage'/);
  // The probe must run before the read-only cleanup, which itself uses storage.
  assert.ok(
    shimmed.indexOf('installMemoryStorage') < shimmed.indexOf("appifact-ro/"),
    'storage must be installed before anything reads it',
  );
});

test('the canvas opens with its properties panel already showing', () => {
  // The editor defaults the panel to closed and remembers the choice in storage
  // the sandbox wipes on every boot — so without a seed the editing tools are
  // always hidden behind a chevron when a canvas opens in the app.
  const shimmed = withCanvasEditShim(seededCanvas);

  const seedAt = shimmed.indexOf("setItem('dc-editor-props-open-v2', 'true')");

  assert.ok(seedAt > -1, 'the panel must be seeded open');
  assert.ok(
    shimmed.indexOf('installMemoryStorage') < seedAt,
    'the seed must be written into storage that exists',
  );
});

test('a plain page is wrapped into a canvas', () => {
  assert.equal(isWrappableHtml('/project/index.html'), true);
  assert.equal(isWrappableHtml('/project/pages/about.htm'), true);
});

test('a seeded canvas is never wrapped again', () => {
  assert.equal(isWrappableHtml('/project/index.canvas.html'), false);
});

test('an artboard is never wrapped — its body is already an <x-dc> root', () => {
  // Wrapping one nests <x-dc> inside <x-dc>, and the editor then refuses every
  // text edit with "This text lives inside a nested component".
  assert.equal(isWrappableHtml('/project/Main.dc.html'), false);
  assert.equal(isWrappableHtml('/project/Mobile.dc.html'), false);
});

test('non-HTML files are left alone', () => {
  assert.equal(isWrappableHtml('/project/canvas.json'), false);
  assert.equal(isWrappableHtml('/project/seed-canvas.mjs'), false);
});
