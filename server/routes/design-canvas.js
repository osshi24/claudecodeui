/**
 * Wraps an ordinary HTML file into a `/design` canvas so it can be edited
 * visually with the canvas editor's tools.
 *
 * A canvas is a self-contained page that carries both the design content and a
 * precompiled editor. The editor only binds to Design Components — an artboard
 * with the `support.js` head line and an `<x-dc>` root — so a plain page has to
 * be converted before it can be seeded.
 *
 * The wrapped canvas is written ALONGSIDE the source as `<name>.canvas.html`;
 * the original file is never modified. Edits saved from the canvas therefore
 * land in the canvas file, not back in the source page.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';

import { projectsDb } from '../modules/database/index.js';

const router = express.Router();

/** Both markers must be present for a page to already be a canvas. */
const CANVAS_MARKERS = ['id="appifact-doc"', 'id="appifact-app"'];

const isCanvasPage = (html) => CANVAS_MARKERS.every((marker) => html.includes(marker));

/**
 * Locates the design skill's payload and helper.
 *
 * The skill is compiled into the Claude Code binary; it only reaches disk in a
 * temp folder after `/design` runs, or wherever the user has copied it into the
 * project. Both are checked because neither is guaranteed.
 */
async function resolveSkillDir(projectRoot) {
  const candidates = [path.join(projectRoot, '.claude', 'skills', 'design')];

  const bundledRoot = path.join(os.tmpdir(), `claude-${process.getuid?.() ?? ''}`, 'bundled-skills');
  try {
    for (const version of await fs.readdir(bundledRoot)) {
      for (const hash of await fs.readdir(path.join(bundledRoot, version))) {
        candidates.push(path.join(bundledRoot, version, hash, 'design'));
      }
    }
  } catch {
    // No extracted bundle yet; the project copy may still answer.
  }

  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'payload.template.html'));
      await fs.access(path.join(dir, 'seed-canvas.mjs'));
      return dir;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/**
 * Rewrites a standalone page as a single Design Component artboard.
 *
 * Stylesheets move into `<helmet>` (where the editor expects page-level CSS)
 * and the body becomes the artboard root. Scripts are dropped on purpose: the
 * artboard renders inside a sandboxed iframe with no network egress, so page
 * scripts would either fail or behave differently than in a browser.
 *
 * Linked stylesheets travel with the inline ones. Web fonts are almost always
 * pulled in through a `<link>` in the head, and dropping those tags silently
 * repainted every wrapped page in a fallback font — the design looked broken
 * for a reason nothing on screen explained.
 */
export function htmlToArtboard(html) {
  const styleLinks = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel\s*=\s*["']?stylesheet/i.test(tag))
    .join('\n  ');

  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join('\n');

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const body = (bodyMatch ? bodyMatch[1] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${styleLinks}
  <style>
${styles}
  </style>
</helmet>
<div>
${body}
</div>
</x-dc>
</body>
</html>
`;
}

function runSeed(skillDir, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(skillDir, 'seed-canvas.mjs'), ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * POST /api/design-canvas/wrap
 * Body: { projectId, filePath }
 * 200 -> { canvasPath, alreadyCanvas }
 */
router.post('/wrap', async (req, res) => {
  try {
    const { projectId, filePath } = req.body || {};
    if (!projectId || !filePath) {
      return res.status(400).json({ error: 'projectId and filePath are required' });
    }

    const projectRoot = await projectsDb.getProjectPathById(projectId);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const resolved = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(projectRoot, filePath);
    if (!resolved.startsWith(path.resolve(projectRoot) + path.sep)) {
      return res.status(403).json({ error: 'Path must be under project root' });
    }
    if (!/\.html?$/i.test(resolved)) {
      return res.status(400).json({ error: 'Only HTML files can be wrapped' });
    }

    const html = await fs.readFile(resolved, 'utf8');
    if (isCanvasPage(html)) {
      return res.json({ canvasPath: resolved, alreadyCanvas: true });
    }

    const skillDir = await resolveSkillDir(projectRoot);
    if (!skillDir) {
      // Nothing to seed from; the caller falls back to a plain preview.
      return res.status(409).json({ error: 'design_payload_unavailable' });
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-wrap-'));
    const canvasPath = resolved.replace(/\.html?$/i, '.canvas.html');
    try {
      await fs.writeFile(path.join(workDir, 'Main.dc.html'), htmlToArtboard(html));

      const title = path.basename(resolved).replace(/\.html?$/i, '');
      const seed = await runSeed(skillDir, [
        '--template', path.join(skillDir, 'payload.template.html'),
        '--out', canvasPath,
        '--title', title,
        '--artboard', path.join(workDir, 'Main.dc.html'),
      ]);

      if (seed.code !== 0) {
        console.error('[DesignCanvas] seed failed', { code: seed.code, stderr: seed.stderr.slice(0, 500) });
        return res.status(500).json({ error: 'Could not build the canvas', details: seed.stderr.slice(0, 300) });
      }

      return res.json({ canvasPath, alreadyCanvas: false });
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[DesignCanvas] wrap error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
