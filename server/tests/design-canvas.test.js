import assert from 'node:assert/strict';
import test from 'node:test';

import { htmlToArtboard } from '../routes/design-canvas.js';

const page = [
  '<!doctype html><html><head>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces">',
  '<link rel="icon" href="/favicon.png">',
  '<style>body { margin: 0 }</style>',
  '</head><body>',
  '<h1>Xin chào</h1>',
  '<script>console.log("runtime")</script>',
  '</body></html>',
].join('');

test('a linked font stylesheet survives the wrap', () => {
  // Dropping it repainted every wrapped page in a fallback font.
  assert.match(htmlToArtboard(page), /fonts\.googleapis\.com\/css2\?family=Fraunces/);
});

test('inline CSS and body content still land in the artboard', () => {
  const artboard = htmlToArtboard(page);

  assert.match(artboard, /<helmet>[\s\S]*margin: 0[\s\S]*<\/helmet>/);
  assert.match(artboard, /<x-dc>[\s\S]*<h1>Xin chào<\/h1>[\s\S]*<\/x-dc>/);
});

test('non-stylesheet links and page scripts are still dropped', () => {
  const artboard = htmlToArtboard(page);

  assert.doesNotMatch(artboard, /favicon\.png/);
  assert.doesNotMatch(artboard, /console\.log\("runtime"\)/);
});
