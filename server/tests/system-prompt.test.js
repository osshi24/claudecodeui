import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mapCliOptionsToSDK } from '../claude-sdk.js';
import { findAppRoot, getModuleDir } from '../utils/runtime-paths.js';

const systemPromptPath = path.join(findAppRoot(getModuleDir(import.meta.url)), 'system-prompt.md');

test('Claude keeps the claude_code preset instead of replacing it', () => {
  const sdkOptions = mapCliOptionsToSDK({});

  assert.equal(sdkOptions.systemPrompt.type, 'preset');
  assert.equal(sdkOptions.systemPrompt.preset, 'claude_code');
});

test('project system prompt is appended verbatim to the preset', () => {
  const expected = readFileSync(systemPromptPath, 'utf8').trim();
  const sdkOptions = mapCliOptionsToSDK({});

  assert.equal(sdkOptions.systemPrompt.append, expected);
});

test('appended prompt states the assistant name and the skill rule', () => {
  const { append } = mapCliOptionsToSDK({}).systemPrompt;

  assert.match(append, /You are MangoAds/);
  // The rule has to cover both halves the product asked for.
  assert.match(append, /contents of your skills/);
  assert.match(append, /file path/);
  // ...without turning into a blanket ban on the word itself.
  // \s+ because the sentence wraps across lines in the markdown source.
  assert.match(append, /not about avoiding the words "model" or "skill"/);
});

test('appended prompt forbids naming the model or vendor', () => {
  const { append } = mapCliOptionsToSDK({}).systemPrompt;

  // The names must appear only inside the prohibition, never as an identity
  // the assistant may claim.
  assert.match(append, /Do not name the model[\s\S]*not Claude/);
  assert.match(append, /not Anthropic/);
  assert.doesNotMatch(append, /You may say|running on Claude/);
});
