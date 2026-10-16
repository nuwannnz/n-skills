// Makes a throwaway scrumo project to point the app at: a copy of the repository's
// sample project in its own git repo, with the scrumo CLI and skills installed.
//   node scripts/setup-demo.js [target]      (SCRUMO_REPO=path/to/the/scrumo/package)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scrumoRepo = resolve(process.env.SCRUMO_REPO ?? join(here, '../..'));
const target = resolve(process.argv[2] ?? join(here, '../.demo/pawplan'));
const sample = join(scrumoRepo, 'examples/sample-project');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

if (!existsSync(sample)) throw new Error(`No sample project at ${sample}. Set SCRUMO_REPO to the scrumo package folder.`);

console.log(`Building scrumo in ${scrumoRepo}`);
run('npm', ['run', 'build', '--silent'], scrumoRepo);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(sample, target, { recursive: true });

run('git', ['init', '-q'], target);
// Written by hand: `npm init` inside this repository would find desktop/package.json and change that instead.
writeFileSync(join(target, 'package.json'), `${JSON.stringify({ name: 'pawplan', private: true }, null, 2)}\n`);
run('npm', ['install', '--save-dev', '--silent', scrumoRepo], target);
run(join(target, 'node_modules/.bin/scrumo'), ['install', '--agents', 'claude'], target);
run('sh', ['-c', 'printf "node_modules/\\n" > .gitignore'], target);
run('git', ['add', '-A'], target);
run('git', ['commit', '-q', '-m', 'PawPlan demo project'], target);
console.log(`\nDemo project ready: ${target}`);
