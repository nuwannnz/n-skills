// Renders build/icon.svg into build/icon.png (transparent), build/icon.icns
// (macOS, needs sips + iconutil) and build/icon.ico (Windows, PNG-in-ICO).
// Run with Electron:  npx electron scripts/make-icons.js
import { app, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const build = join(dirname(fileURLToPath(import.meta.url)), '../build');
const svg = readFileSync(join(build, 'icon.svg'), 'utf8');

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true, zoomFactor: 1 } });
  await win.loadURL(`data:text/html,<style>html,body{margin:0;background:transparent}</style>${encodeURIComponent(svg)}`);
  await new Promise(r => setTimeout(r, 300));
  const png = (await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })).resize({ width: 1024, height: 1024 }).toPNG();
  writeFileSync(join(build, 'icon.png'), png);

  const set = join(build, 'icon.iconset');
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set);
  const resize = (size, file) => execFileSync('sips', ['-z', String(size), String(size), join(build, 'icon.png'), '--out', file], { stdio: 'ignore' });
  for (const s of [16, 32, 128, 256, 512]) {
    resize(s, join(set, `icon_${s}x${s}.png`));
    resize(s * 2, join(set, `icon_${s}x${s}@2x.png`));
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(build, 'icon.icns')]);

  // ICO with PNG payloads: 6-byte header, 16-byte directory entry per image, then the PNGs.
  const sizes = [16, 32, 48, 256];
  const pngs = sizes.map(s => { const f = join(set, `ico-${s}.png`); resize(s, f); return readFileSync(f); });
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e); header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(join(build, 'icon.ico'), Buffer.concat([header, ...pngs]));
  rmSync(set, { recursive: true, force: true });
  console.log('icons written to build/');
  app.quit();
});
