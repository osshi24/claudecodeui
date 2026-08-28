/**
 * Regenerates every PWA/browser icon from the single brand mark in
 * public/logo.svg, so a rebrand only means replacing that one file.
 *
 * Run with: node public/generate-icons.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const publicDir = path.dirname(fileURLToPath(import.meta.url));
const sourceLogoPath = path.join(publicDir, 'logo.svg');

const PWA_ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const STANDALONE_LOGO_SIZES = [32, 64, 128, 256, 512];
const FAVICON_SIZE = 32;

// A high density keeps the rasteriser from sampling the vector at the output
// size, which would soften the edges on the larger icons.
const RENDER_DENSITY = 600;

const sourceLogo = await fs.readFile(sourceLogoPath);
const sourceMarkup = sourceLogo.toString('utf8');

async function writePng(outputPath, size) {
  await sharp(sourceLogo, { density: RENDER_DENSITY })
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`  ${String(size).padStart(3)}px  ${path.relative(publicDir, outputPath)}`);
}

async function writeSvg(outputPath, size) {
  const resized = sourceMarkup.replace(
    /width="\d+" height="\d+"/,
    `width="${size}" height="${size}"`,
  );
  await fs.writeFile(outputPath, resized);
  console.log(`  ${String(size).padStart(3)}px  ${path.relative(publicDir, outputPath)}`);
}

await fs.mkdir(path.join(publicDir, 'icons'), { recursive: true });

console.log('PWA icons:');
for (const size of PWA_ICON_SIZES) {
  await writePng(path.join(publicDir, 'icons', `icon-${size}x${size}.png`), size);
  await writeSvg(path.join(publicDir, 'icons', `icon-${size}x${size}.svg`), size);
}

console.log('Standalone logos:');
for (const size of STANDALONE_LOGO_SIZES) {
  await writePng(path.join(publicDir, `logo-${size}.png`), size);
}

console.log('Favicon:');
await writePng(path.join(publicDir, 'favicon.png'), FAVICON_SIZE);
await fs.writeFile(path.join(publicDir, 'favicon.svg'), sourceMarkup);
console.log(`         favicon.svg`);

await fs.writeFile(path.join(publicDir, 'icons', 'icon-template.svg'), sourceMarkup);

console.log('\nDone. Desktop icons are separate: npm run desktop:icon:mac');
