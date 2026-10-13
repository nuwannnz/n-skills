// The nsk commands: validate --fix, new, schema, and the process-level contract.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { moveCommand } from '../../src/cli/move.ts';
import { newCommand } from '../../src/cli/new.ts';
import { sprintCommand } from '../../src/cli/sprint.ts';
import { schemaCommand } from '../../src/cli/schema.ts';
import { board, statusCommand } from '../../src/cli/status.ts';
import { fix, validate } from '../../src/validate/index.ts';
import { EPIC3, Fixture, PRD, SAMPLE, STORY4, STORY6, STORY8, TRACKER } from '../support.ts';

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

const move = (f: Fixture, id: string, status: string, extra: { assignee?: string; reason?: string } = {}) =>
  moveCommand(id, status, f.root, { assignee: extra.assignee, reason: extra.reason, today: '2026-10-13' });

describe('nsk move', () => {
  it('moves a story through its gates and keeps generated tables fresh', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-8', 'in-progress').code, 1); // needs an assignee
    assert.match(f.read(STORY8), /^status: ready$/m);
    assert.equal(move(f, 'PAW-8', 'in-progress', { assignee: 'jo' }).code, 0);
    assert.match(f.read(STORY8), /^status: in-progress$/m);
    assert.match(f.read(STORY8), /^assignee: "jo"$/m);
    assert.match(f.read(STORY8), /^updated: 2026-10-13$/m);
    assert.match(f.read(TRACKER), /\| PAW-8 \| Book an appointment \| PAW-2 \| 3 \| in-progress \| jo \|/);
    assert.deepEqual(f.findings(), []);
  });

  it('refuses illegal transitions and unmet gates without changing any file', () => {
    const f = fresh();
    const before = f.read(STORY6);
    assert.match(move(f, 'PAW-8', 'done').out, /from ready it can go to/i);
    const failed = move(f, 'PAW-6', 'done');
    assert.equal(failed.code, 1);
    assert.match(failed.out, /NSK606/);
    assert.equal(f.read(STORY6), before);
    assert.equal(move(f, 'PAW-99', 'done').code, 1);
    assert.equal(move(f, 'PAW-8', 'blocked').code, 2); // needs a reason
  });

  it('sets and clears blocked_reason', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-8', 'blocked', { reason: 'Waiting on design' }).code, 0);
    assert.match(f.read(STORY8), /^blocked_reason: "Waiting on design"$/m);
    assert.equal(move(f, 'PAW-8', 'ready').code, 0);
    assert.match(f.read(STORY8), /^blocked_reason: null$/m);
  });

  it('moves documents too', () => {
    const f = fresh();
    assert.equal(move(f, 'prd', 'draft').code, 1); // would break approved epics
    assert.match(f.read(PRD), /^status: approved$/m);
  });
});

describe('nsk status', () => {
  it('summarises the sample project and says what is next', () => {
    const result = board(SAMPLE)!;
    assert.equal(result.project.key, 'PAW');
    assert.equal(result.sprints.find((s) => s.status === 'active')!.points, 10);
    assert.deepEqual(result.stories, { draft: 1, ready: 1, 'in-progress': 1, 'in-qa': 1, done: 2, blocked: 1 });
    assert.ok(result.next[0]!.startsWith('/n-qa PAW-6'));
    assert.match(statusCommand(SAMPLE, false).out, /Sprint 2 \(active\)/);
  });

  it('points at the first missing planning document in a new project', () => {
    const f = fresh(null);
    f.write('nsk.yaml', 'schema_version: 1\nnsk_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nignore: []\n');
    mkdirSync(f.path('docs'));
    assert.match(board(f.root)!.next[0]!, /^\/n-kickoff/);
    newCommand('tracker', f.root, noOptions);
    assert.deepEqual(f.findings(), []);
  });
});

describe('sprint planning edits (what /n-sprint plan does by hand)', () => {
  it('a new planned sprint validates once --fix has filled the generated tables', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-9', 'ready').code, 0);
    f.edit(TRACKER, '    completed: null\n---', '    completed: null\n  - number: 3\n    status: planned\n    goal: Owners can cancel.\n    start: 2026-10-12\n    end: 2026-10-23\n    capacity: 8\n    committed: null\n    completed: null\n---');
    f.edit(TRACKER, '## Sprint 2\n', '## Sprint 3\n\n### Stories\n\n### Review\n\n### Retro\n\n## Sprint 2\n');
    f.edit('docs/stories/PAW-9-cancel-appointment.md', 'sprint: null', 'sprint: 3');
    assert.ok(f.codes().includes('NSK702'));
    fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.match(f.read(TRACKER), /<!-- nsk:generated:sprint-3 -->[\s\S]*\| PAW-9 \| Cancel an appointment \| PAW-2 \| 2 \| ready \| - \|/);
  });
});

const sprint = (f: Fixture, sub: string, arg: string | undefined, o: Partial<Parameters<typeof sprintCommand>[3]> = {}) =>
  sprintCommand(sub, arg, f.root, { goal: undefined, capacity: undefined, start: undefined, end: undefined, stories: undefined, today: '2026-10-13', ...o });

describe('nsk sprint', () => {
  it('closes a sprint, carries unfinished stories over, then plans and starts the next', () => {
    const f = fresh();
    assert.equal(sprint(f, 'close', '1').code, 1); // already closed
    const closed = sprint(f, 'close', '2');
    assert.equal(closed.code, 0, closed.out);
    assert.match(closed.out, /PAW-6 \(was in-qa\), PAW-7 \(was in-progress\), PAW-8 \(was ready\)/);
    assert.match(f.read(STORY6), /^status: ready$/m);
    assert.match(f.read(STORY6), /^assignee: null$/m);
    assert.match(f.read(STORY6), /^sprint: null$/m);
    assert.ok(f.codes().includes('NSK409'), 'review and retro are still to be written');
    f.edit(TRACKER, '<!-- Filled at /n-sprint close. -->', '- Nothing was accepted; everything carried over.');
    f.edit(TRACKER, '<!-- Filled at /n-sprint close. -->', '- **Went well:** Test plans.\n- **To improve:** Estimates.\n- **Actions:**\n  - sam: re-estimate.');
    assert.deepEqual(f.findings(), []);

    const planned = sprint(f, 'plan', undefined, { goal: 'Finish booking.', capacity: '8', stories: 'PAW-7,PAW-8' });
    assert.equal(planned.code, 0, planned.out);
    assert.match(planned.out, /planned sprint 3: 2 stories, 8 of 8 points, 2026-10-19 to 2026-11-01/);
    assert.match(f.read(TRACKER), /^## Sprint 3$/m);
    assert.deepEqual(f.findings(), []);
    const started = sprint(f, 'start', '3');
    assert.equal(started.code, 0, started.out);
    assert.match(f.read(TRACKER), /status: active\n {4}goal: Finish booking\.[\s\S]*committed: 8/);
    assert.deepEqual(f.findings(), []);
  });

  it('rejects stories that are not ready and a second active sprint', () => {
    const f = fresh();
    assert.equal(sprint(f, 'plan', undefined, { goal: 'x', capacity: '5', stories: 'PAW-4' }).code, 1);
    assert.equal(sprint(f, 'plan', undefined, { goal: 'x', capacity: '5' }).code, 2);
    assert.equal(sprint(f, 'start', '2').code, 1);
    assert.equal(sprint(f, 'start', '9').code, 2);
  });

  it('creates the tracker as sprint 1 when the project has none', () => {
    const f = fresh();
    f.remove(TRACKER);
    for (const file of ['PAW-4-email-signup', 'PAW-5-login-logout', 'PAW-6-password-reset', 'PAW-7-open-slots', 'PAW-8-book-appointment']) {
      const rel = `docs/stories/${file}.md`;
      f.write(rel, f.read(rel).replace(/^sprint: \d+$/m, 'sprint: null'));
    }
    f.edit(STORY8, 'depends_on: [PAW-7]', 'depends_on: []');
    const planned = sprint(f, 'plan', undefined, { goal: 'First sprint.', capacity: '4', stories: 'PAW-8' });
    assert.equal(planned.code, 0, planned.out);
    assert.match(f.read(TRACKER), /^## Sprint 1$/m);
    assert.ok(!f.codes().includes('NSK505'));
  });
});

describe('nsk validate --fix with missing sections', () => {
  it('restores required sections that an edit dropped, empty and in order', () => {
    const f = fresh();
    f.edit(STORY8, '\n## Test Plan\n\n<!-- Written by /n-qa, ideally while the story is ready. -->\n\n## Dev Record\n\n<!-- Filled by /n-dev before moving to in-qa. -->\n\n## QA Record\n\n<!-- Filled by /n-qa, one row per AC per round. -->\n', '');
    assert.ok(f.codes().includes('NSK401'));
    fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.match(f.read(STORY8), /## Test Plan\n[\s\S]*## Dev Record\n[\s\S]*## QA Record\n/);
  });
});
