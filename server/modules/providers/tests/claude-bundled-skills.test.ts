import assert from 'node:assert/strict';
import test from 'node:test';

import { ClaudeSkillsProvider } from '@/modules/providers/list/claude/claude-skills.provider.js';

/**
 * Bundled skills live inside the Claude Code binary, so no directory scan can
 * find them. These assertions pin the one source that surfaces them.
 */
test('bundled skills are offered even though nothing on disk lists them', async () => {
  const skills = await new ClaudeSkillsProvider().listSkills();
  const bundled = skills.filter((skill) => skill.scope === 'system');
  const commands = bundled.map((skill) => skill.command).sort();

  assert.deepEqual(commands, ['/artifact-design', '/dataviz', '/design']);
});

test('each bundled skill carries what the slash menu renders', async () => {
  const skills = await new ClaudeSkillsProvider().listSkills();
  const design = skills.find((skill) => skill.scope === 'system' && skill.command === '/design');

  assert.ok(design, '/design must be offered');
  assert.equal(design.provider, 'claude');
  assert.equal(design.name, 'design');
  assert.ok(design.description.length > 20, 'the menu shows the description');
});
