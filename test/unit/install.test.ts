// Phase 4: scrumo init, install, and update.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { initCommand, installCommand, type InstallOptions } from '../../src/cli/install.ts';
import { chooseDirs } from '../../src/install/dirs.ts';
import { applyPrefix, readSkills, skillNames } from '../../src/install/skills.ts';
import { loadAgents } from '../../src/spec/load.ts';
import { validate } from '../../src/validate/index.ts';
import { Fixture } from '../support.ts';

const fixtures: Fixture[] = [];
const empty = () => {
  const f = new Fixture(null);
  fixtures.push(f);
  return f;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

const options = (o: Partial<InstallOptions> = {}): InstallOptions => ({ agents: undefined, prefix: undefined, name: undefined, key: 'ACME', hooks: false, ci: false, force: false, ...o });
const agents = loadAgents();
const pick = (...ids: string[]) => agents.filter((a) => ids.includes(a.id));
const listing = (root: string, dir: string): string[] => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).sort() : []);
const ALL = skillNames().map((n) => `scrumo-${n}`);

describe('agent directories', () => {
  it('agents.yaml is complete and verified', () => {
    assert.deepEqual(agents.map((a) => a.id), ['claude', 'codex', 'cursor', 'gemini', 'copilot']);
  });

  it('picks the fewest directories that every agent reads', () => {
    assert.deepEqual([...chooseDirs(pick('claude')).keys()], ['.claude/skills']);
    assert.deepEqual([...chooseDirs(pick('cursor')).keys()], ['.cursor/skills']);
    assert.deepEqual([...chooseDirs(pick('claude', 'codex', 'cursor')).keys()].sort(), ['.agents/skills', '.claude/skills']);
    assert.deepEqual([...chooseDirs(pick('codex', 'gemini', 'copilot')).keys()], ['.agents/skills']);
    assert.deepEqual([...chooseDirs(pick('claude', 'codex', 'cursor', 'gemini', 'copilot')).keys()].sort(), ['.agents/skills', '.claude/skills']);
  });
});

describe('prefix', () => {
  it('renames folders, names, and cross-references together, and nothing else', () => {
    const skills = readSkills('acme-');
    assert.deepEqual(skills.map((s) => s.name).sort(), skillNames().map((n) => `acme-${n}`).sort());
    const prd = skills.find((s) => s.name === 'acme-prd')!.files.get('SKILL.md')!;
    assert.match(prd, /^name: acme-prd$/m);
    assert.match(prd, /`\/acme-architecture`/);
    assert.ok(!/\bn-(prd|architecture)\b/.test(prd));
    assert.match(prd, /docs\/|docs_dir/);
    assert.equal(applyPrefix('a scrumo-prd and an-prd and n-prds', 'x-', ['prd']), 'a x-prd and an-prd and n-prds');
  });
});

describe('scrumo init', () => {
  it('sets up a fresh repository for claude, codex and cursor with one command', () => {
    const f = empty();
    const result = initCommand(f.root, options({ agents: 'claude,codex,cursor', name: 'Acme Portal' }));
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(listing(f.root, '.claude/skills'), ALL.slice().sort());
    assert.deepEqual(listing(f.root, '.agents/skills'), ALL.slice().sort());
    assert.ok(!existsSync(f.path('.cursor')), 'cursor reads the shared folders, so it gets no copy of its own');
    assert.match(f.read('scrumo.yaml'), /^agents: \[claude, codex, cursor\]$/m);
    assert.match(f.read('scrumo.yaml'), /^skill_prefix: scrumo-$/m);
    assert.match(f.read('AGENTS.md'), /npx scrumo validate --fix/);
    assert.match(f.read('AGENTS.md'), /npm install --save-dev scrumo/);
    assert.match(f.read('CLAUDE.md'), /scrumo:agents:begin/);
    assert.ok(statSync(f.path('docs/epics')).isDirectory());
    assert.deepEqual(validate(f.root).findings, []);
    assert.ok(JSON.parse(f.read('.scrumo/manifest.json')).files['.claude/skills/scrumo-prd/SKILL.md']);
  });

  it('needs a valid key, and refuses nothing when re-run', () => {
    const f = empty();
    assert.equal(initCommand(f.root, options({ key: undefined })).code, 2);
    assert.equal(initCommand(f.root, options({ key: 'a' })).code, 2);
    assert.equal(initCommand(f.root, options()).code, 0);
    const again = initCommand(f.root, options({ key: undefined }));
    assert.equal(again.code, 0);
    assert.match(again.out, /0 added, 0 updated, 10 unchanged/);
  });

  it('guesses agents from what the repository already has', () => {
    const f = empty();
    mkdirSync(f.path('.cursor'));
    initCommand(f.root, options());
    assert.match(f.read('scrumo.yaml'), /^agents: \[cursor\]$/m);
    assert.deepEqual(listing(f.root, '.cursor/skills'), ALL.slice().sort());
  });

  it('works in an existing repository: keeps AGENTS.md content and adds the block once', () => {
    const f = empty();
    f.write('AGENTS.md', '# Our rules\n\nBe kind.\n');
    initCommand(f.root, options({ agents: 'codex' }));
    initCommand(f.root, options({ agents: 'codex' }));
    const text = f.read('AGENTS.md');
    assert.match(text, /^# Our rules\n\nBe kind\.\n\n<!-- scrumo:agents:begin -->/);
    assert.equal(text.match(/scrumo:agents:begin/g)!.length, 1);
    assert.ok(!existsSync(f.path('CLAUDE.md')));
  });

  it('adds the hook and workflow only when asked', () => {
    const f = empty();
    mkdirSync(f.path('.git'));
    writeFileSync(f.path('.git/HEAD'), 'ref: refs/heads/main\n');
    initCommand(f.root, options({ agents: 'claude' }));
    assert.ok(!existsSync(f.path('.git/hooks/pre-commit')) && !existsSync(f.path('.github')));
    const result = initCommand(f.root, options({ hooks: true, ci: true }));
    assert.match(result.out, /pre-commit hook: created/);
    assert.match(f.read('.git/hooks/pre-commit'), /scrumo-managed/);
    assert.match(f.read('.git/hooks/pre-commit'), /\[ -x node_modules\/\.bin\/scrumo \]/);
    assert.ok(statSync(f.path('.git/hooks/pre-commit')).mode & 0o100, 'hook is executable');
    assert.match(f.read('.github/workflows/scrumo-validate.yml'), /npx --yes -p scrumo scrumo validate/);
    f.write('.git/hooks/pre-commit', '#!/bin/sh\necho mine\n');
    assert.match(initCommand(f.root, options({ hooks: true })).out, /pre-commit hook: skipped/);
    assert.match(f.read('.git/hooks/pre-commit'), /echo mine/);
  });
});

describe('scrumo update and install', () => {
  const setup = () => {
    const f = empty();
    initCommand(f.root, options({ agents: 'claude' }));
    return f;
  };
  const prd = '.claude/skills/scrumo-prd/SKILL.md';

  it('restores an untouched skill, but never overwrites a local edit unless forced', () => {
    const f = setup();
    f.write(prd, `${f.read(prd)}\nMy team's addition.\n`);
    const kept = installCommand('update', f.root, options());
    assert.equal(kept.code, 1);
    assert.match(kept.out, /edited locally/);
    assert.match(f.read(prd), /My team's addition/);
    const forced = installCommand('update', f.root, options({ force: true }));
    assert.equal(forced.code, 0);
    assert.doesNotMatch(f.read(prd), /My team's addition/);
  });

  it('refreshes skills that changed in the package, using a different skills source', () => {
    const f = setup();
    const manifest = JSON.parse(f.read('.scrumo/manifest.json'));
    f.write(prd, `${f.read(prd)}\n`); // simulate: file on disk is the "old" release
    manifest.files[prd] = createHash('sha256').update(f.read(prd)).digest('hex');
    f.write('.scrumo/manifest.json', JSON.stringify(manifest));
    const result = installCommand('update', f.root, options());
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /1 updated/);
  });

  it('switches prefix: renames every skill and removes the old ones', () => {
    const f = setup();
    const result = installCommand('install', f.root, options({ prefix: 'acme-' }));
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(listing(f.root, '.claude/skills'), skillNames().map((n) => `acme-${n}`).sort());
    assert.match(f.read('scrumo.yaml'), /^skill_prefix: acme-$/m);
    assert.match(f.read('AGENTS.md'), /\/acme-kickoff/);
    assert.match(result.out, /10 added, 0 updated, 0 unchanged, 10 removed/);
    assert.deepEqual(validate(f.root).findings, []);
  });

  it('adding an agent installs where it is missing, and dropping one removes only unedited files', () => {
    const f = setup();
    installCommand('install', f.root, options({ agents: 'claude,codex' }));
    assert.deepEqual(listing(f.root, '.agents/skills').length, 10);
    installCommand('install', f.root, options({ agents: 'claude' }));
    assert.ok(!existsSync(f.path('.agents')), 'unedited files and the empty folders are gone');
  });

  it('rejects unknown agents and a bad prefix', () => {
    const f = setup();
    assert.equal(installCommand('install', f.root, options({ agents: 'vim' })).code, 2);
    assert.equal(installCommand('install', f.root, options({ prefix: 'Acme' })).code, 2);
    assert.equal(installCommand('install', empty().root, options()).code, 1);
  });

  it('warns from validate when scrumo.yaml records another scrumo version, and update fixes it', () => {
    const f = setup();
    f.edit('scrumo.yaml', /cli_version: \S+/.exec(f.read('scrumo.yaml'))![0], 'cli_version: 0.0.1');
    assert.ok(validate(f.root).findings.some((x) => x.code === 'SCRUMO106'));
    installCommand('update', f.root, options());
    assert.deepEqual(validate(f.root).findings, []);
  });
});

describe('older scrumo.yaml', () => {
  it('gains skill_prefix on update, in the right place', () => {
    const f = empty();
    f.write('scrumo.yaml', 'schema_version: 1\ncli_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nignore: []\n');
    mkdirSync(f.path('docs'));
    assert.equal(installCommand('update', f.root, options()).code, 0);
    assert.match(f.read('scrumo.yaml'), /agents: \[claude\]\nskill_prefix: scrumo-\nignore: \[\]/);
    assert.deepEqual(validate(f.root).findings, []);
  });
});
