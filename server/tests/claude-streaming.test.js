import assert from 'node:assert/strict';
import test from 'node:test';

import { mapCliOptionsToSDK, transformMessage } from '../claude-sdk.js';
import { ClaudeSessionsProvider } from '../modules/providers/list/claude/claude-sessions.provider.js';

test('Claude asks the SDK for partial messages', () => {
  assert.equal(mapCliOptionsToSDK({}).includePartialMessages, true);
});

test('stream_event wrappers are unwrapped to the raw Anthropic event', () => {
  const unwrapped = transformMessage({
    type: 'stream_event',
    session_id: 'abc',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Xin' } },
  });

  assert.equal(unwrapped.type, 'content_block_delta');
  assert.equal(unwrapped.delta.text, 'Xin');
});

test('subagent deltas keep their parent tool id through the unwrap', () => {
  const unwrapped = transformMessage({
    type: 'stream_event',
    parent_tool_use_id: 'toolu_1',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
  });

  assert.equal(unwrapped.parentToolUseId, 'toolu_1');
});

test('non-streaming messages pass through untouched', () => {
  const message = { type: 'assistant', message: { role: 'assistant', content: [] } };
  assert.equal(transformMessage(message), message);
});

test('an unwrapped delta normalizes into a stream_delta the client understands', () => {
  const wrapped = {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'chào' } },
  };

  const normalized = new ClaudeSessionsProvider().normalizeMessage(transformMessage(wrapped), 'sess-1');

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, 'stream_delta');
  assert.equal(normalized[0].content, 'chào');
});

test('block completion normalizes into stream_end', () => {
  const wrapped = { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } };

  const normalized = new ClaudeSessionsProvider().normalizeMessage(transformMessage(wrapped), 'sess-1');

  assert.equal(normalized[0].kind, 'stream_end');
});

test('a streamed skill body is not rendered as a user message', () => {
  // The CLI appends the SKILL.md body as a synthetic "user" turn. On disk it
  // carries `isMeta`, but the live SDK stream omits it — so this row used to
  // reach the UI as a red user bubble that vanished on reload.
  const skillInjection = {
    type: 'user',
    message: {
      role: 'user',
      content: [{
        type: 'text',
        text: 'Base directory for this skill: /Users/me/.claude/commands/frontend-design\n\nThis skill guides...',
      }],
    },
  };

  const normalized = new ClaudeSessionsProvider().normalizeMessage(skillInjection, 'sess-1');

  assert.deepEqual(normalized, []);
});

test('rows sourced from a tool use stay out of the transcript', () => {
  const injected = {
    type: 'user',
    sourceToolUseID: 'toolu_01UoQPogAoHUWVTKfSqsN2yD',
    message: { role: 'user', content: [{ type: 'text', text: 'injected context' }] },
  };

  assert.deepEqual(new ClaudeSessionsProvider().normalizeMessage(injected, 'sess-1'), []);
});

test('a real user message still normalizes into a user bubble', () => {
  const typed = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'giúp tôi tạo một landing page' }] },
  };

  const normalized = new ClaudeSessionsProvider().normalizeMessage(typed, 'sess-1');

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].role, 'user');
  assert.equal(normalized[0].content, 'giúp tôi tạo một landing page');
});
