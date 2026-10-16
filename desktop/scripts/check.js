// Syntax-checks every JavaScript file of the app, so CI notices a broken file without starting Electron.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!['node_modules', '.demo', 'build'].includes(name)) walk(path); } else if (/\.(js|cjs|mjs)$/.test(name)) files.push(path);
  }
};
['src', 'bin', 'scripts'].forEach(d => walk(join(root, d)));
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`${files.length} files OK`);
