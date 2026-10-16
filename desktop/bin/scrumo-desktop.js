#!/usr/bin/env node
// scrumo-desktop [project-folder]      open the app (on that project, if it has a scrumo.yaml)
// scrumo-desktop --install-launcher    add Scrumo to Applications / the Start menu
// scrumo-desktop --uninstall-launcher  remove it (npm doesn't run uninstall scripts)
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureElectron, installLauncher, launcherExists, launcherPath, pkgDir, removeLauncher } from '../src/launcher.js';

const arg = process.argv[2];

if (arg === '--version' || arg === '-v') {
  console.log(JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version);
} else if (arg === '--install-launcher') {
  ensureElectron();
  console.log(`Added ${installLauncher()}`);
} else if (arg === '--uninstall-launcher') {
  console.log(`Removed ${removeLauncher()}`);
} else if (arg === '--help' || arg === '-h') {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 4).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
} else {
  const project = resolve(arg ?? process.cwd());
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // Prefer the launcher on macOS so the Dock and menu bar say "Scrumo", not "Electron".
  const [cmd, args] = process.platform === 'darwin' && launcherExists()
    ? ['open', ['-n', '-a', launcherPath(), '--args', project]]
    : [ensureElectron(), [pkgDir, project]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', env }).unref();
}
