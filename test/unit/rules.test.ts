// Phase 1 contract: the sample project is clean, and every rule code in
// spec/rules.yaml fires on a project broken in exactly the way it describes.
// Each case starts from a fresh copy of the sample project.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { loadSpec } from '../../src/spec/load.ts';
import { validate } from '../../src/validate/index.ts';
import { ARCH, CONFIG, EPIC1, EPIC2, EPIC3, Fixture, PRD, SAMPLE, STORY4, STORY5, STORY6, STORY7, STORY8, TRACKER } from '../support.ts';

const spec = loadSpec();
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

const FR_HEADER = '| ID | Requirement | Priority | Source |\n| --- | --- | --- | --- |';

const cases: Record<string, Array<[string, (f: Fixture) => void]>> = {
  SCRUMO101: [['unknown file in docs/', (f) => f.write('docs/notes.md', '# Notes\n')]],
  SCRUMO102: [['badly named story file', (f) => f.rename(STORY4, 'docs/stories/PAW-4-Email_Signup.md')]],
  SCRUMO103: [['file name ID differs from frontmatter id', (f) => f.rename(STORY4, 'docs/stories/PAW-14-email-signup.md')]],
  SCRUMO104: [
    ['scrumo.yaml removed', (f) => f.remove(CONFIG)],
    ['scrumo.yaml has a bad key', (f) => f.edit(CONFIG, 'key: PAW', 'key: paw')],
  ],
  SCRUMO105: [
    ['frontmatter ref uses another key', (f) => f.edit(STORY4, 'epic: PAW-1', 'epic: OTH-1')],
    ['file name uses another key', (f) => f.rename(STORY4, 'docs/stories/OTH-4-email-signup.md')],
  ],
  SCRUMO106: [['scrumo.yaml records another scrumo version', (f) => f.edit(CONFIG, 'cli_version: 0.1.0', 'cli_version: 0.0.9')]],
  SCRUMO201: [['markdownlint violation', (f) => f.edit(EPIC1, '- Sign up with email and password.', '* Sign up with email and password.')]],
  SCRUMO202: [['second H1', (f) => f.write(PRD, `${f.read(PRD)}\n# Another title\n`)]],
  SCRUMO203: [['H1 differs from title', (f) => f.edit(PRD, '# PawPlan Product Requirements', '# PawPlan Requirements')]],
  SCRUMO204: [['CRLF line endings', (f) => f.write(PRD, f.read(PRD).replaceAll('\n', '\r\n'))]],
  SCRUMO205: [['H4 heading', (f) => f.write(STORY4, `${f.read(STORY4)}\n#### Deep\n`)]],
  SCRUMO301: [['no frontmatter', (f) => f.write(PRD, f.read(PRD).replace(/^---\n[\s\S]*?\n---\n/, ''))]],
  SCRUMO302: [['missing field', (f) => f.edit(PRD, 'version: 1.1.0\n', '')]],
  SCRUMO303: [['unknown field', (f) => f.edit(PRD, 'updated: 2026-09-08\n---', 'updated: 2026-09-08\nextra: 1\n---')]],
  SCRUMO304: [['wrong type', (f) => f.edit(STORY4, 'points: 3', 'points: "3"')]],
  SCRUMO305: [['value not allowed', (f) => f.edit(STORY4, 'priority: P0', 'priority: P7')]],
  SCRUMO306: [['bad date', (f) => f.edit(STORY4, 'created: 2026-09-12', 'created: 12/09/2026')]],
  SCRUMO307: [['keys out of order', (f) => f.edit(STORY4, 'status: done\npriority: P0', 'priority: P0\nstatus: done')]],
  SCRUMO401: [['required section removed', (f) => f.removeSection(STORY4, 'Technical Notes')]],
  SCRUMO402: [['section out of order', (f) => f.moveSectionToEnd(STORY4, 'Technical Notes')]],
  SCRUMO403: [['unknown section', (f) => f.write(STORY4, `${f.read(STORY4)}\n## Mystery\n\nText.\n`)]],
  SCRUMO404: [['duplicate section', (f) => f.write(STORY4, `${f.read(STORY4)}\n## Technical Notes\n\nMore.\n`)]],
  SCRUMO405: [['table section holds prose', (f) => f.setSection(PRD, 'Functional Requirements', 'Just some prose.')]],
  SCRUMO406: [['wrong table columns', (f) => f.setSection(PRD, 'Functional Requirements', '| ID | Text |\n| --- | --- |\n| FR-001 | x |')]],
  SCRUMO407: [['duplicate row ID', (f) => f.setSection(PRD, 'Functional Requirements', `${FR_HEADER}\n| FR-001 | The system shall a. | P0 | Brief |\n| FR-001 | The system shall b. | P0 | Brief |`)]],
  SCRUMO408: [['AC does not follow Given/When/Then', (f) => f.setSection(STORY4, 'Acceptance Criteria', '- AC-1: do something')]],
  SCRUMO409: [['required section is empty', (f) => f.setSection(STORY5, 'Tasks', '')]],
  SCRUMO410: [['open question in an approved PRD', (f) => f.setSection(PRD, 'Open Questions', '- Q-01: Is this fine?')]],
  SCRUMO411: [['placeholder in an approved PRD', (f) => f.setSection(PRD, 'Overview', 'TBD.')]],
  SCRUMO412: [['changelog version differs', (f) => f.edit(PRD, 'version: 1.1.0', 'version: 1.2.0')]],
  SCRUMO501: [['duplicate ticket ID', (f) => f.write('docs/stories/PAW-4-copy.md', f.read(STORY4))]],
  SCRUMO502: [
    ['story epic does not exist', (f) => f.edit(STORY4, 'epic: PAW-1', 'epic: PAW-99')],
    ['story epic is a story', (f) => f.edit(STORY4, 'epic: PAW-1', 'epic: PAW-5')],
  ],
  SCRUMO503: [['requirement not in PRD', (f) => f.edit(EPIC3, 'requirements: [FR-007]', 'requirements: [FR-099]')]],
  SCRUMO504: [['FR covered by no epic', (f) => f.edit(EPIC3, 'requirements: [FR-007]', 'requirements: []')]],
  SCRUMO505: [['sprint not in tracker', (f) => f.edit(STORY8, 'sprint: 2', 'sprint: 9')]],
  SCRUMO506: [['dependency cycle', (f) => f.edit(STORY7, 'depends_on: []', 'depends_on: [PAW-7]')]],
  SCRUMO507: [['task cites an undefined AC', (f) => f.edit(STORY8, '(AC-3)', '(AC-9)')]],
  SCRUMO508: [['approved architecture leaves an NFR unmapped', (f) => f.write(ARCH, f.read(ARCH).replace(/^\| NFR-004 \|.*\n/m, ''))]],
  SCRUMO509: [['coverage rows differ from requirements', (f) => f.edit(EPIC1, 'requirements: [FR-001, FR-002]', 'requirements: [FR-001]')]],
  SCRUMO510: [['sprint numbers skip', (f) => f.edit(TRACKER, 'number: 2', 'number: 3')]],
  SCRUMO601: [['epics need an approved PRD', (f) => f.edit(PRD, 'status: approved', 'status: draft')]],
  SCRUMO602: [['ready story without points', (f) => f.edit(STORY8, 'points: 3', 'points: null')]],
  SCRUMO603: [['ready story in a draft epic', (f) => f.edit(EPIC2, 'status: in-progress', 'status: draft')]],
  SCRUMO604: [['in-progress story without assignee', (f) => f.edit(STORY7, 'assignee: alex', 'assignee: null')]],
  SCRUMO605: [['in-qa story with an unchecked task', (f) => f.edit(STORY6, '- [x] Add reset tokens table', '- [ ] Add reset tokens table')]],
  SCRUMO606: [['done story with a failing AC', (f) => f.edit(STORY4, '| PASS |', '| FAIL |')]],
  SCRUMO607: [['reason on a story that is not blocked', (f) => f.edit(STORY4, 'reason: null', 'reason: stale')]],
  SCRUMO608: [['epic done before its stories', (f) => f.edit(EPIC1, 'status: in-progress', 'status: done')]],
  SCRUMO609: [['two active sprints', (f) => f.edit(TRACKER, 'status: closed', 'status: active')]],
  SCRUMO610: [['over capacity', (f) => f.edit(TRACKER, 'capacity: 12', 'capacity: 5')]],
  SCRUMO611: [['draft story in an active sprint', (f) => f.edit(STORY8, 'status: ready', 'status: draft')]],
  SCRUMO612: [['story ahead of its dependency', (f) => f.edit(STORY7, 'sprint: 2', 'sprint: null')]],
  SCRUMO613: [['cancelled story still in a sprint', (f) => f.edit(STORY8, 'status: ready', 'status: cancelled').edit(STORY8, 'reason: null', 'reason: Dropped')]],
  SCRUMO614: [['story depends on a cancelled story', (f) => f.edit(STORY7, 'status: in-progress', 'status: cancelled').edit(STORY7, 'reason: null', 'reason: Dropped')]],
  SCRUMO615: [['assignee is not on the team', (f) => f.edit(STORY7, 'assignee: alex', 'assignee: nobody')]],
  SCRUMO701: [['stale generated block', (f) => f.edit(EPIC3, '_No stories yet._', '_Edited by hand._')]],
  SCRUMO702: [['missing end marker', (f) => f.edit(EPIC3, '<!-- scrumo:end -->\n', '')]],
};

describe('validator rules', () => {
  it('passes the sample project with no findings', () => {
    assert.deepEqual(validate(SAMPLE).findings, []);
  });

  it('has a case for every rule code, and no case for an unknown one', () => {
    assert.deepEqual(Object.keys(cases).sort(), spec.rules.map((r) => r.code).sort());
  });

  for (const [code, scenarios] of Object.entries(cases)) {
    for (const [name, mutate] of scenarios) {
      it(`${code}: ${name}`, () => {
        const fixture = new Fixture();
        fixtures.push(fixture);
        mutate(fixture);
        const found = fixture.findings();
        const hit = found.find((f) => f.code === code);
        assert.ok(hit, `expected ${code}, got ${found.map((f) => f.code).join(', ') || 'nothing'}`);
        assert.equal(hit.severity, spec.rules.find((r) => r.code === code)!.severity);
      });
    }
  }
});
