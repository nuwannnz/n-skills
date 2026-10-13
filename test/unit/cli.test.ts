// The nsk commands: validate --fix, new, schema, and the process-level contract.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { newCommand } from '../../src/cli/new.ts';
import { schemaCommand } from '../../src/cli/schema.ts';
import { fix, validate } from '../../src/validate/index.ts';
import { EPIC3, Fixture, PRD, SAMPLE, STORY4, STORY8, TRACKER } from '../support.ts';

const CLI = new URL('../../src/cli.ts', import.meta.url).pathname;
const fixtures: Fixture[] = [];
const fresh = (source: string | null = SAMPLE) => {
  const fixture = new Fixture(source);
  fixtures.push(fixture);
  return fixture;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

const nsk = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const noOptions = { title: undefined, epic: undefined, priority: undefined, requirements: undefined, dependsOn: undefined, today: '2026-10-13' };

describe('nsk validate --fix', () => {
  it('repairs every fixable problem and stamps updated', () => {
    const f = fresh();
    f.write(PRD, f.read(PRD).replaceAll('\n', '\r\n').replace('# PawPlan Product Requirements', '# Wrong title'));
    f.edit(STORY4, 'status: done\npriority: P0', 'priority: P0\nstatus: done');
    f.edit(STORY4, 'blocked_reason: null', 'blocked_reason: stale');
    f.edit(EPIC3, '_No stories yet._', '_Edited by hand._');
    f.edit(TRACKER, '| 2 | active |', '| 3 | active |');
    f.write(STORY8, `${f.read(STORY8).replace('## Technical Notes', '## Technical Notes  ')}`);
    assert.ok(f.codes().length > 0);

    const changed = fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.ok(changed.includes(PRD) && changed.includes(STORY4) && changed.includes(EPIC3));
    assert.match(f.read(PRD), /^updated: 2026-10-13$/m);
    assert.match(f.read(STORY4), /^status: done$/m);
    assert.match(f.read(STORY4), /^blocked_reason: null$/m);
    assert.doesNotMatch(f.read(PRD), /\r/);
  });

  it('does nothing to a clean project', () => {
    const f = fresh();
    assert.deepEqual(fix(f.root, '2026-10-13'), []);
    assert.deepEqual(validate(f.root).findings, []);
  });

  it('leaves judgment calls for the agent', () => {
    const f = fresh();
    f.edit(STORY4, 'points: 3', 'points: "3"');
    fix(f.root, '2026-10-13');
    assert.ok(f.codes().includes('NSK304'));
  });
});

describe('nsk new', () => {
  it('creates an epic then a story, numbering them together and keeping generated blocks fresh', () => {
    const f = fresh();
    assert.equal(newCommand('epic', f.root, { ...noOptions, title: 'Billing: invoices', requirements: 'FR-001', priority: 'P1' }).code, 0);
    assert.ok(f.read('docs/epics/PAW-11-billing-invoices.md').includes('priority: P1'));
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'Pay an invoice', epic: 'PAW-11', dependsOn: 'PAW-8' }).code, 0);
    assert.match(f.read('docs/stories/PAW-12-pay-an-invoice.md'), /^depends_on: \[PAW-8\]$/m);
    assert.match(f.read('docs/epics/PAW-11-billing-invoices.md'), /\| PAW-12 \| Pay an invoice \| draft \| - \| - \|/);
    assert.match(f.read(TRACKER), /\| PAW-12 \| Pay an invoice \| PAW-11 \| P2 \| - \| draft \|/);
    assert.deepEqual(f.findings(), []);
  });

  it('rejects a story for a missing epic and an existing file', () => {
    const f = fresh();
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X', epic: 'PAW-99' }).code, 1);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X', epic: 'PAW-5' }).code, 1);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X' }).code, 2);
    assert.equal(newCommand('prd', f.root, noOptions).code, 1);
    assert.equal(newCommand('widget', f.root, noOptions).code, 2);
  });

  it('creates every planning document as a valid draft in an empty project', () => {
    const f = fresh(null);
    f.write('nsk.yaml', 'schema_version: 1\nnsk_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nignore: []\n');
    mkdirSync(f.path('docs'));
    for (const kind of ['brief', 'prd', 'architecture', 'standards']) {
      assert.equal(newCommand(kind, f.root, { ...noOptions, today: '2026-10-13' }).code, 0, kind);
    }
    assert.equal(newCommand('epic', f.root, { ...noOptions, title: 'First epic' }).code, 0);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'First story', epic: 'DEMO-1' }).code, 0);
    assert.deepEqual(f.findings(), []);
  });
});

describe('nsk schema', () => {
  it('describes a type, accepts the tracker alias, and lists the rules', () => {
    assert.match(schemaCommand(['story'], false).out, /### Acceptance Criteria/);
    assert.match(schemaCommand(['tracker'], false).out, /# Sprint tracker/);
    assert.equal(JSON.parse(schemaCommand(['epic'], true).out).kind, 'epic');
    assert.match(schemaCommand(['rules'], false).out, /NSK612/);
    assert.equal(schemaCommand(['nope'], false).code, 2);
  });
});

describe('nsk process', () => {
  it('exits 0 and prints a summary for the sample project', () => {
    const result = nsk(['validate', SAMPLE], process.cwd());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no problems found in 15 files/);
  });

  it('exits 1 with grouped findings and machine-readable output', () => {
    const f = fresh();
    f.edit(STORY8, '(AC-3)', '(AC-1)');
    const text = nsk(['validate'], f.root);
    assert.equal(text.status, 1);
    assert.match(text.stdout, /docs\/stories\/PAW-8-book-appointment\.md\n {2}NSK602 /);
    assert.match(text.stdout, /✖ 1 error, 0 warnings in 1 file/);
    const json = JSON.parse(nsk(['validate', '--json'], f.root).stdout) as { ok: boolean; findings: Array<{ code: string }> };
    assert.equal(json.ok, false);
    assert.deepEqual(json.findings.map((x) => x.code), ['NSK602']);
  });

  it('limits output to the path asked for, but still checks the whole project', () => {
    const f = fresh();
    f.edit(STORY8, '(AC-3)', '(AC-1)');
    assert.equal(nsk(['validate', 'docs/stories/PAW-4-email-signup.md'], f.root).status, 0);
    assert.equal(nsk(['validate', 'docs/stories'], f.root).status, 1);
  });

  it('exits 0 with only warnings', () => {
    const f = fresh();
    f.edit(TRACKER, 'capacity: 12', 'capacity: 5');
    fix(f.root, '2026-10-13'); // the overview table repeats capacity
    const result = nsk(['validate'], f.root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /NSK610 {2}\(warning\)/);
  });

  it('reports a missing project', () => {
    const f = fresh(null);
    const result = nsk(['validate'], f.root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /NSK104/);
    assert.equal(nsk([], f.root).status, 2);
    assert.equal(nsk(['bogus'], f.root).status, 2);
  });
});
