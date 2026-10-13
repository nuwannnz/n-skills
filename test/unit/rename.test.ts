// The product name lives in spec/brand.yaml, and npm run rename changes it everywhere, reversibly.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const brand = parse(readFileSync(join(ROOT, 'spec/brand.yaml'), 'utf8')) as { name: string; package: string };
const SKIP = new Set(['node_modules', 'dist', '.git']);

function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (SKIP.has(name)) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name !== 'package-lock.json' && name !== 'rename.test.ts') out.set(relative(dir, path), readFileSync(path, 'utf8')); // the test mentions both names, so it rewrites itself
    }
  };
  walk(dir);
  return out;
}

function copyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rename-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.split('/').at(-1)!) || src === ROOT });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

const run = (dir: string, ...args: string[]) => execFileSync(process.execPath, [join(dir, 'scripts/rename.ts'), ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('product name', () => {
  it('is the same in brand.yaml, package.json, and the bin', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string; bin: Record<string, string> };
    assert.equal(pkg.name, brand.package);
    assert.deepEqual(Object.keys(pkg.bin), [brand.name]);
  });

  it('is what the skills, config file, and rule codes use', () => {
    assert.ok(existsSync(join(ROOT, `examples/sample-project/${brand.name}.yaml`)));
    assert.ok(existsSync(join(ROOT, `skills/${brand.name}-prd/SKILL.md`)));
    assert.match(readFileSync(join(ROOT, 'spec/rules.yaml'), 'utf8'), new RegExp(`code: ${brand.name.toUpperCase()}101`));
  });

  it('renames everywhere and can be undone byte for byte', () => {
    const dir = copyRepo();
    try {
      const before = snapshot(dir);
      const dry = run(dir, 'zorblax', '--dry-run');
      assert.match(dry, /would change \d+ files/);
      assert.deepEqual(snapshot(dir), before, 'a dry run changes nothing');

      run(dir, 'zorblax');
      assert.ok(existsSync(join(dir, 'examples/sample-project/zorblax.yaml')));
      assert.ok(existsSync(join(dir, 'skills/zorblax-prd/SKILL.md')));
      assert.ok(existsSync(join(dir, 'templates/zorblax-validate.yml')));
      assert.match(readFileSync(join(dir, 'spec/brand.yaml'), 'utf8'), new RegExp(`name: zorblax\\npackage: "${brand.package.includes('/') ? `${brand.package.split('/')[0]}/zorblax` : 'zorblax'}"`));
      assert.match(readFileSync(join(dir, 'spec/rules.yaml'), 'utf8'), /code: ZORBLAX101/);
      assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).bin.zorblax, 'dist/cli.js');
      const leftovers = [...snapshot(dir)].filter(([, text]) => new RegExp(`\\b${brand.name}\\b`).test(text)).map(([file]) => file);
      assert.deepEqual(leftovers, [], 'no file still mentions the old name');

      // The renamed project still works: the CLI validates the renamed sample project.
      const out = execFileSync(process.execPath, [join(dir, 'src/cli.ts'), 'validate', join(dir, 'examples/sample-project')], { encoding: 'utf8' });
      assert.match(out, /no problems found/);

      run(dir, brand.name);
      assert.deepEqual(snapshot(dir), before, 'renaming back restores every file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects bad names', () => {
    assert.throws(() => run(ROOT, 'Bad-Name', '--dry-run'), /lowercase/);
    assert.throws(() => run(ROOT, brand.name, '--dry-run'), /already called/);
  });
});
