// The team roster in scrumo.yaml: scrumo team, the assignee rule, and who-is-who from git.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { initCommand } from '../../src/cli/install.ts';
import { teamCommand, type TeamOptions } from '../../src/cli/team.ts';
import { fix } from '../../src/validate/index.ts';
import { CONFIG, Fixture, STORY4, STORY7 } from '../support.ts';

const fixtures: Fixture[] = [];
const fresh = (source?: string | null) => {
  const f = source === undefined ? new Fixture() : new Fixture(source);
  fixtures.push(f);
  return f;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

const team = (f: Fixture, sub: string | undefined, arg?: string, o: Partial<TeamOptions> = {}) =>
  teamCommand(sub, arg, f.root, { name: undefined, roles: undefined, points: undefined, emails: undefined, me: false, force: false, json: false, ...o });

const asGitUser = (f: Fixture, name: string, email: string) => {
  execFileSync('git', ['init', '-q'], { cwd: f.root });
  execFileSync('git', ['config', 'user.name', name], { cwd: f.root });
  execFileSync('git', ['config', 'user.email', email], { cwd: f.root });
};

describe('scrumo team', () => {
  it('lists the roster with its typical capacity', () => {
    const out = team(fresh(), 'list').out;
    assert.match(out, /3 team members, typical capacity 9 points per sprint/);
    assert.match(out, /alex {2}Alex Rivera {2}\[dev\] {2}5 pts\/sprint/);
    assert.match(out, /jo {4}Jo Marsh {2}\[owner\] {2}no points set/);
    assert.equal(JSON.parse(team(fresh(), 'list', undefined, { json: true }).out).capacity, 9);
  });

  it('adds, changes, and removes members, keeping the config valid', () => {
    const f = fresh();
    assert.equal(team(f, 'add', 'kim', { name: 'Kim Ito', roles: 'dev,qa', points: '3', emails: 'kim@pawplan.example' }).code, 0);
    assert.match(f.read(CONFIG), /  - id: kim\n    name: Kim Ito\n    roles: \[dev, qa\]\n    points: 3\n    emails: \[kim@pawplan.example\]\nignore: \[\]/);
    assert.deepEqual(f.findings(), []);
    assert.equal(team(f, 'set', 'kim', { points: '4', roles: 'architect' }).code, 0);
    assert.match(f.read(CONFIG), /name: Kim Ito\n    roles: \[architect\]\n    points: 4/);
    assert.equal(team(f, 'set', 'kim', { points: 'none' }).code, 0);
    assert.match(f.read(CONFIG), /points: null\n    emails: \[kim@/);
    assert.equal(team(f, 'remove', 'kim').code, 0);
    assert.ok(!f.read(CONFIG).includes('kim'));
    assert.deepEqual(f.findings(), []);
  });

  it('rejects bad input and duplicates', () => {
    const f = fresh();
    assert.equal(team(f, 'add', 'Kim', { name: 'Kim' }).code, 2);
    assert.equal(team(f, 'add', 'kim').code, 2); // needs a name
    assert.equal(team(f, 'add', 'kim', { name: 'Kim', roles: 'wizard' }).code, 2);
    assert.equal(team(f, 'add', 'kim', { name: 'Kim', points: '-1' }).code, 2);
    assert.equal(team(f, 'add', 'kim', { name: 'Kim', emails: 'nope' }).code, 2);
    assert.equal(team(f, 'add', 'alex', { name: 'Another Alex' }).code, 1);
    assert.equal(team(f, 'set', 'ghost', { points: '1' }).code, 1);
    assert.equal(team(f, 'set', 'alex').code, 2);
    assert.equal(team(f, 'bogus').code, 2);
  });

  it('will not remove someone who still has open stories, unless forced', () => {
    const f = fresh();
    const refused = team(f, 'remove', 'alex');
    assert.equal(refused.code, 1);
    assert.match(refused.out, /PAW-7/);
    assert.equal(team(f, 'remove', 'alex', { force: true }).code, 0);
    assert.ok(f.codes().includes('SCRUMO615'), 'validation then asks for the stories to be reassigned');
  });

  it('adds the git user with --me, and recognises them by email or name', () => {
    const f = fresh(null);
    f.write(CONFIG, 'schema_version: 1\ncli_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nskill_prefix: scrumo-\nteam: []\nignore: []\n');
    mkdirSync(f.path('docs'));
    asGitUser(f, 'Riley Quinn', 'Riley.Quinn@Example.com');
    assert.equal(team(f, 'whoami').code, 1);
    const added = team(f, 'add', undefined, { me: true, roles: 'owner' });
    assert.equal(added.code, 0, added.out);
    assert.match(f.read(CONFIG), /- id: riley.quinn\n    name: Riley Quinn\n    roles: \[owner\]\n    points: null\n    emails: \[Riley.Quinn@Example.com\]/);
    assert.equal(team(f, 'whoami').out.trim(), 'riley.quinn');
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: f.root });
    assert.equal(team(f, 'whoami').out.trim(), 'riley.quinn', 'falls back to the name');
    execFileSync('git', ['config', 'user.name', 'Someone Else'], { cwd: f.root });
    assert.equal(team(f, 'whoami').code, 1);
  });

  it('a new project starts with an empty team, and the first assignee is free text until someone joins', () => {
    const f = fresh(null);
    initCommand(f.root, { agents: 'claude', prefix: undefined, name: undefined, key: 'ACME', hooks: false, ci: false, force: false });
    assert.match(f.read(CONFIG), /^team: \[\]$/m);
    assert.match(team(f, 'list').out, /No team members yet/);
    assert.deepEqual(f.findings(), []);
  });
});

describe('the assignee rule', () => {
  it('applies to open stories only, and only once the team has a member', () => {
    const f = fresh();
    f.edit(STORY4, 'assignee: alex', 'assignee: former-member'); // PAW-4 is done: history stays valid
    fix(f.root, '2026-10-13'); // the sprint tables repeat the assignee
    assert.deepEqual(f.findings(), []);
    f.edit(STORY7, 'assignee: alex', 'assignee: nobody');
    fix(f.root, '2026-10-13');
    const finding = f.findings().find((x) => x.code === 'SCRUMO615')!;
    assert.match(finding.message, /isn't on the team \(alex, sam, jo\)/);
    f.edit(CONFIG, /team:[\s\S]*?\nignore/.exec(f.read(CONFIG))![0], 'team: []\nignore');
    assert.deepEqual(f.findings(), [], 'an empty team switches the check off');
  });

  it('reports duplicate team ids in the config', () => {
    const f = fresh();
    f.edit(CONFIG, 'id: sam', 'id: alex');
    assert.ok(f.codes().includes('SCRUMO104'));
  });
});
