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

/**
 * Runs the shim's crypto polyfill the way a browser would: against a `crypto`
 * that has `getRandomValues` but no `randomUUID` — exactly what an insecure
 * origin (http://<lan-ip>) hands the page.
 */
function runCryptoPolyfill(cryptoStub: Record<string, unknown>): void {
  const shim = withCanvasEditShim(seededCanvas);
  // Just the `if` block, without the surrounding try/catch that would not close.
  const body = /if \(typeof crypto[\s\S]*?\n {4}\}\n/.exec(shim);
  assert.ok(body, 'crypto polyfill missing from the shim');
  new Function('crypto', 'Uint8Array', 'Object', body[0])(cryptoStub, Uint8Array, Object);
}

test('an insecure origin still gets a working crypto.randomUUID', () => {
  // http://localhost is a secure context; http://192.168.x.x is not, and the
  // canvas editor calls randomUUID while building its first artboard.
  const stub: Record<string, unknown> = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = (i * 37 + 11) & 0xff;
      return array;
    },
  };

  runCryptoPolyfill(stub);

  const uuid = (stub.randomUUID as () => string)();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a secure origin keeps the browser implementation', () => {
  const native = () => 'native-uuid';
  const stub: Record<string, unknown> = { randomUUID: native, getRandomValues: (a: Uint8Array) => a };

  runCryptoPolyfill(stub);

  assert.equal(stub.randomUUID, native, 'the polyfill overwrote a working implementation');
});

test('successive UUIDs differ', () => {
  const stub: Record<string, unknown> = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
      return array;
    },
  };

  runCryptoPolyfill(stub);
  const make = stub.randomUUID as () => string;

  assert.notEqual(make(), make());
});

/**
 * Executes the shim's srcdoc patch against stand-ins for the DOM classes it
 * touches, then reports what an artboard document would actually receive.
 */
function runSrcdocPatch(): { viaProperty: string; viaAttribute: string } {
  const shim = withCanvasEditShim(seededCanvas);
  // Anchored on the setAttribute patch so the match spans both routes to
  // srcdoc, and stops before the closing brace of the enclosing `if`.
  const block = /var UUID_MARK[\s\S]*?Element\.prototype\.setAttribute = function[\s\S]*?\n {6}\};\n/.exec(shim);
  assert.ok(block, 'srcdoc patch missing from the shim');

  let stored = '';
  class FakeIframe {
    setAttribute(name: string, value: string) { stored = `attr:${value}`; }
  }
  const proto = FakeIframe.prototype as unknown as Record<string, unknown>;
  Object.defineProperty(proto, 'srcdoc', {
    configurable: true, enumerable: true,
    get: () => stored, set: (value: string) => { stored = `prop:${value}`; },
  });

  const cryptoStub = { getRandomValues: (a: Uint8Array) => a };
  new Function('crypto', 'HTMLIFrameElement', 'Element', 'Object', 'Uint8Array', block[0])(
    cryptoStub, FakeIframe, FakeIframe, Object, Uint8Array,
  );

  const frame = new FakeIframe() as unknown as { srcdoc: string; setAttribute: (n: string, v: string) => void };
  frame.srcdoc = '<html><head><title>Artboard</title></head><body>x</body></html>';
  const viaProperty = stored;
  frame.setAttribute('srcdoc', '<html><head></head><body>y</body></html>');
  return { viaProperty, viaAttribute: stored };
}

test('an artboard set through the srcdoc property receives the polyfill', () => {
  const { viaProperty } = runSrcdocPatch();

  assert.match(viaProperty, /mangoads-uuid-polyfill/);
  // It has to run before the artboard's own markup, or the editor calls
  // randomUUID first and throws exactly as it did before.
  assert.match(viaProperty, /<head><script id="mangoads-uuid-polyfill">/);
  assert.match(viaProperty, /<title>Artboard<\/title>/);
});

test('an artboard set through setAttribute receives it too', () => {
  // React writes srcdoc as an attribute, so covering only the property would
  // have fixed this by luck rather than by design.
  assert.match(runSrcdocPatch().viaAttribute, /mangoads-uuid-polyfill/);
});

test('the injected polyfill produces a valid v4 UUID', () => {
  const { viaProperty } = runSrcdocPatch();
  const source = /<script id="mangoads-uuid-polyfill">([\s\S]*?)<\/script>/.exec(viaProperty);
  assert.ok(source, 'no polyfill script found');

  const cryptoStub: Record<string, unknown> = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
      return array;
    },
  };
  new Function('crypto', 'Uint8Array', 'Object', source[1])(cryptoStub, Uint8Array, Object);

  assert.match((cryptoStub.randomUUID as () => string)(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
