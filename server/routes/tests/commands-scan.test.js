import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanCommandsDirectory } from '../commands.js';

async function withCommandsDir(build, runTest) {
  const dir = await mkdtemp(path.join(tmpdir(), 'commands-scan-'));
  try {
    await build(dir);
    await runTest(dir, await scanCommandsDirectory(dir, dir, 'user'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('plain markdown files become slash commands', async () => {
  await withCommandsDir(
    async (dir) => {
      await writeFile(path.join(dir, 'code-review.md'), '---\ndescription: Review code\n---\nbody');
    },
    (_dir, commands) => {
      assert.equal(commands.length, 1);
      assert.equal(commands[0].name, '/code-review');
      assert.equal(commands[0].description, 'Review code');
    },
  );
});

test('a SKILL.md is skipped instead of becoming a command', async () => {
  // Skill folders sometimes live under commands/. Scanned as a command, the
  // file's whole body would be pasted into the chat as the user's message.
  await withCommandsDir(
    async (dir) => {
      const skillDir = path.join(dir, 'frontend-design');
      await mkdir(skillDir);
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-design\n---\nlong skill body');
    },
    (_dir, commands) => {
      assert.deepEqual(commands, []);
    },
  );
});

test('skipping a skill leaves sibling commands in the same tree alone', async () => {
  await withCommandsDir(
    async (dir) => {
      const skillDir = path.join(dir, 'pptx');
      await mkdir(skillDir);
      await writeFile(path.join(skillDir, 'SKILL.md'), 'skill body');
      await writeFile(path.join(skillDir, 'helper.md'), '---\ndescription: Helper\n---\nbody');
      await writeFile(path.join(dir, 'aside.md'), '---\ndescription: Aside\n---\nbody');
    },
    (_dir, commands) => {
      const names = commands.map((command) => command.name).sort();
      assert.deepEqual(names, ['/aside', '/pptx/helper']);
    },
  );
});
