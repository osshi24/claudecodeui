import fs from 'node:fs/promises';
import sharp from 'sharp';

const size = 1024;
const assetsDir = 'electron/assets';
const sourceLogoPath = 'public/logo.svg';
const iconPath = 'electron/assets/logo-macos.png';
const icnsPath = 'electron/assets/logo-macos.icns';
const icoPath = 'electron/assets/logo-windows.ico';

// Desktop icons are rendered from the same brand mark the web app serves, so
// the two never drift apart. Re-run `npm run desktop:icon:mac` after changing
// public/logo.svg.
const sourceLogo = await fs.readFile(sourceLogoPath);

async function renderPng(entrySize) {
  return sharp(sourceLogo, { density: 600 })
    .resize(entrySize, entrySize)
    .png()
    .toBuffer();
}

await fs.mkdir(assetsDir, { recursive: true });
await fs.writeFile(iconPath, await renderPng(size));

const icnsEntries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
];

const blocks = await Promise.all(icnsEntries.map(async ([type, entrySize]) => {
  const png = await renderPng(entrySize);
  const block = Buffer.alloc(8 + png.length);
  block.write(type, 0, 4, 'ascii');
  block.writeUInt32BE(block.length, 4);
  png.copy(block, 8);
  return block;
}));

const totalLength = 8 + blocks.reduce((sum, block) => sum + block.length, 0);
const header = Buffer.alloc(8);
header.write('icns', 0, 4, 'ascii');
header.writeUInt32BE(totalLength, 4);

await fs.writeFile(icnsPath, Buffer.concat([header, ...blocks], totalLength));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = await Promise.all(icoSizes.map((entrySize) => renderPng(entrySize)));

const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const icoHeader = Buffer.alloc(ICO_HEADER_BYTES);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // 1 = icon
icoHeader.writeUInt16LE(icoSizes.length, 4);

let icoOffset = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * icoSizes.length;
const icoEntries = icoSizes.map((entrySize, index) => {
  const entry = Buffer.alloc(ICO_ENTRY_BYTES);
  entry.writeUInt8(entrySize >= 256 ? 0 : entrySize, 0); // 0 means 256
  entry.writeUInt8(entrySize >= 256 ? 0 : entrySize, 1);
  entry.writeUInt8(0, 2); // palette colours
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(icoImages[index].length, 8);
  entry.writeUInt32LE(icoOffset, 12);
  icoOffset += icoImages[index].length;
  return entry;
});

await fs.writeFile(icoPath, Buffer.concat([icoHeader, ...icoEntries, ...icoImages]));
