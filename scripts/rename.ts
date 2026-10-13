// Renames the product everywhere, from the name in spec/brand.yaml to a new one.
// Usage: node scripts/rename.ts <new-name> [--package @scope/new-name] [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const SKIP = new Set(['node_modules', 'dist', '.git']);
const NAME = /^[a-z][a-z0-9]{1,11}$/;

function listFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter((f) => f && existsSync(join(root, f)));
  } catch {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      if (SKIP.has(name)) return [];
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(root, path)];
    });
    return walk(root);
  }
}

const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/@]/g, '\\$&');

export function renameProduct(next: string, options: { package?: string | undefined; dryRun?: boolean } = {}): { files: string[]; moved: string[] } {
  const brandPath = join(root, 'spec', 'brand.yaml');
  const brand = parse(readFileSync(brandPath, 'utf8')) as { name: string; package: string };
  if (!NAME.test(next)) throw new Error(`The name must be 2 to 12 lowercase letters or digits, starting with a letter; got "${next}".`);
  if (next === brand.name) throw new Error(`The product is already called ${next}.`);
  const nextPackage = options.package ?? (brand.package.includes('/') ? `${brand.package.split('/')[0]}/${next}` : next);

  const slashed = (name: string): string => name.replaceAll('/', '\\/'); // as written inside a regular expression literal
  const rules: Array<[RegExp, string]> = [
    [new RegExp(`(?<![\\w@/.-])${escape(brand.package)}(?![\\w-])`, 'g'), nextPackage],
    ...(brand.package.includes('/') ? [[new RegExp(`(?<![\\w@/.-])${escape(slashed(brand.package))}(?![\\w-])`, 'g'), slashed(nextPackage)] as [RegExp, string]] : []),
    [new RegExp(`\\b${brand.name}\\b`, 'g'), next],
    [new RegExp(`\\b${cap(brand.name)}\\b`, 'g'), cap(next)],
    [new RegExp(`\\b${brand.name.toUpperCase()}(?=[1-7\\d])`, 'g'), next.toUpperCase()],
  ];
  const changed: string[] = [];
  for (const file of listFiles()) {
    if (basename(file) === 'package-lock.json') continue;
    const bytes = readFileSync(join(root, file));
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    const out = rules.reduce((acc, [pattern, to]) => acc.replace(pattern, to), text);
    if (out !== text) {
      changed.push(file);
      if (!options.dryRun) writeFileSync(join(root, file), out);
    }
  }

  // File and folder names that carry the name: <name>.yaml, <name>-validate.yml, skills/<name>-prd/.
  const moved: string[] = [];
  const token = new RegExp(`\\b${brand.name}\\b`);
  const paths = new Set(listFiles().flatMap((file) => file.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  for (const path of [...paths].sort((a, b) => b.split('/').length - a.split('/').length)) {
    const name = basename(path);
    if (!token.test(name)) continue;
    const target = join(dirname(path), name.replace(new RegExp(`\\b${brand.name}\\b`, 'g'), next));
    moved.push(`${path} -> ${target}`);
    if (!options.dryRun) renameSync(join(root, path), join(root, target));
  }
  if (!options.dryRun && existsSync(join(root, 'package-lock.json'))) {
    try {
      execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: root, stdio: 'ignore' });
    } catch {
      /* the lockfile is refreshed by the next npm install */
    }
  }
  return { files: changed, moved };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { package: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  if (positionals.length !== 1) {
    console.error('Usage: npm run rename -- <new-name> [--package @scope/new-name] [--dry-run]');
    process.exit(2);
  }
  try {
    const result = renameProduct(positionals[0]!, { package: values.package, dryRun: values['dry-run'] === true });
    console.log(`${values['dry-run'] ? 'would change' : 'changed'} ${result.files.length} files and rename ${result.moved.length} paths`);
    if (values['dry-run']) for (const file of result.files) console.log(`  ${file}`);
    for (const move of result.moved) console.log(`  ${move}`);
    if (!values['dry-run']) console.log('\nReview with git diff, then run npm run check. Projects already set up with the old name keep their old config file and markers: see PLAN.md, "Renaming the product".');
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
