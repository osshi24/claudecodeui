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
