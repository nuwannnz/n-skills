// Adds an app launcher after a global npm install, so people open Scrumo from
// Launchpad, Spotlight or the Dock (macOS), the Start menu (Windows) or the
// app menu (Linux) instead of a terminal.
//
// macOS: ~/Applications/Scrumo.app is a clone of the Electron.app that npm
// installed, renamed, given our icon, pointed at this package, and ad-hoc
// signed on this machine. Files created locally carry no quarantine flag, so
// Gatekeeper doesn't ask Apple about it and no paid certificate is involved.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APP_NAME = 'Scrumo';
export const APP_ID = 'dev.scrumo.desktop';
export const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

/**
 * The Electron binary npm installed, found through electron's path.txt (works
 * from Node and from inside Electron, where require('electron') is the API).
 */
export function electronBinary() {
  const dir = electronPackageDir();
  const txt = join(dir, 'path.txt');
  const bin = existsSync(txt) && join(dir, 'dist', readFileSync(txt, 'utf8').trim());
  if (!bin || !existsSync(bin)) throw new Error('Electron is not downloaded yet; run "scrumo-desktop" once, or reinstall scrumo-desktop');
  return bin;
}

function electronPackageDir() {
  for (let dir = pkgDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules/electron/install.js'))) return join(dir, 'node_modules/electron');
    if (dirname(dir) === dir) throw new Error('The electron package is missing; reinstall scrumo-desktop');
  }
}

/**
 * Electron 44 downloads its binary (about 130 MB) on first use instead of at
 * install time. Do it now, from Node, so it happens during `npm install`.
 */
export function ensureElectron() {
  try { return electronBinary(); } catch { /* download below */ }
  console.log('Scrumo: downloading Electron (about 130 MB)…');
  execFileSync(process.execPath, [join(electronPackageDir(), 'install.js')], { stdio: 'inherit' });
  return electronBinary();
}

/** True for a global install (npm i -g), the only kind worth a launcher: npx caches and dev checkouts move or vanish. */
export function isGlobalInstall(dir = pkgDir) {
  return /[\\/]node_modules[\\/]/.test(dir) && !/[\\/]_npx[\\/]/.test(dir);
}

export function launcherPath() {
  if (process.platform === 'darwin') return join(homedir(), 'Applications', `${APP_NAME}.app`);
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs', `${APP_NAME}.lnk`);
  return join(homedir(), '.local/share/applications', 'scrumo.desktop');
}

export function installLauncher() {
  if (process.platform === 'darwin') return installMac();
  if (process.platform === 'win32') return installWindows();
  return installLinux();
}

export function removeLauncher() {
  const p = launcherPath();
  rmSync(p, { recursive: true, force: true });
  return p;
}

function installMac() {
  const source = electronBinary().replace(/\/Contents\/MacOS\/[^/]+$/, '');
  const dest = launcherPath();
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  try { execFileSync('cp', ['-cR', source, dest]); } catch { execFileSync('cp', ['-R', source, dest]); } // -c: APFS clone, no extra disk space

  const plist = join(dest, 'Contents/Info.plist');
  const set = (key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist]);
  set('CFBundleName', APP_NAME);
  set('CFBundleDisplayName', APP_NAME);
  set('CFBundleIdentifier', APP_ID);
  set('CFBundleShortVersionString', version);
  set('CFBundleIconFile', 'scrumo.icns');
  copyFileSync(join(pkgDir, 'build/icon.icns'), join(dest, 'Contents/Resources/scrumo.icns'));

  // Electron runs Contents/Resources/app if present: a stub that loads this package.
  const stub = join(dest, 'Contents/Resources/app');
  mkdirSync(stub);
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: 'scrumo-launcher', productName: APP_NAME, version, type: 'module', main: 'main.js' }, null, 2));
  writeFileSync(join(stub, 'main.js'), stubMain(pathToFileURL(join(pkgDir, 'src/main.js')).href));

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', dest], { stdio: 'ignore' });
  try {
    execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', dest], { stdio: 'ignore' });
  } catch { /* Spotlight picks it up on its own, a little later */ }
  return dest;
}

function stubMain(target) {
  return `// Written by scrumo-desktop's installer. Loads the installed package.
import { app, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = ${JSON.stringify(target)};
if (existsSync(fileURLToPath(target))) {
  await import(target);
} else {
  await app.whenReady();
  dialog.showMessageBoxSync({
    type: 'warning',
    message: 'Scrumo is no longer installed',
    detail: 'This launcher points to a scrumo-desktop install that has been removed. Reinstall it with "npm install -g scrumo-desktop", or move this app to the Trash.',
  });
  app.quit();
}
`;
}

function installWindows() {
  const lnk = launcherPath();
  const q = s => String(s).replace(/'/g, "''");
  mkdirSync(dirname(lnk), { recursive: true });
  const ps = [
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${q(lnk)}')`,
    `$s.TargetPath = '${q(electronBinary())}'`,
    `$s.Arguments = '"${q(pkgDir)}"'`,
    `$s.IconLocation = '${q(join(pkgDir, 'build/icon.ico'))},0'`,
    `$s.WorkingDirectory = '${q(homedir())}'`,
    `$s.Description = '${APP_NAME}'`,
    '$s.Save()',
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
  return lnk;
}

function installLinux() {
  const file = launcherPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, [
    '[Desktop Entry]', 'Type=Application', `Name=${APP_NAME}`, 'Comment=Spec-driven planning with your own Claude Code',
    `Exec="${electronBinary()}" "${pkgDir}" %U`, `Icon=${join(pkgDir, 'build/icon.png')}`, 'Categories=Development;Office;', 'Terminal=false', '',
  ].join('\n'));
  return file;
}

export const launcherExists = () => existsSync(launcherPath());
