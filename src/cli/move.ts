// scrumo move <id|document> <status>: changes a status, checking the transition
// and every gate. A move that would introduce a new error is rolled back.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setField, yamlString } from '../validate/edit.ts';
import { findRoot, loadProject } from '../validate/project.ts';
import { describeErrors, transaction } from './transaction.ts';

export interface MoveOptions {
  assignee: string | undefined;
  reason: string | undefined;
  today?: string;
}

const DOCUMENTS = ['brief', 'prd', 'architecture', 'standards'];

export function moveCommand(target: string | undefined, status: string | undefined, cwd: string, options: MoveOptions): { code: number; out: string } {
  if (!target || !status) return { code: 2, out: 'Usage: scrumo move <ticket ID|brief|prd|architecture|standards> <status> [--assignee NAME] [--reason TEXT]\n' };
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const root = findRoot(cwd);
  if (!root) return { code: 1, out: 'No scrumo.yaml found in or above this folder.\n' };
  const project = loadProject(root, () => {});
  if (!project) return { code: 1, out: 'scrumo.yaml is invalid; run scrumo validate.\n' };

  const doc = project.tickets.get(target) ?? (DOCUMENTS.includes(target) ? project.docs.find((d) => d.kind === target) : undefined);
  if (!doc) return { code: 1, out: `${target} doesn't exist.\n` };
  const schema = project.spec.schemas.get(doc.kind!)!;
  const current = doc.fm?.status;
  if (!schema.statuses || typeof current !== 'string') return { code: 1, out: `${doc.file} has no status to move.\n` };
  if (!schema.statuses.values.includes(status)) return { code: 2, out: `"${status}" isn't a ${schema.kind} status. Use one of: ${schema.statuses.values.join(', ')}.\n` };
  if (current === status) return { code: 1, out: `${target} is already ${status}.\n` };
  const allowed = schema.statuses.transitions[current] ?? [];
  if (!allowed.includes(status)) return { code: 1, out: `Can't move ${target} from ${current} to ${status}. From ${current} it can go to: ${allowed.join(', ') || 'nowhere'}.\n` };
  if (status === 'blocked' && !options.reason) return { code: 2, out: 'Moving to blocked needs --reason "why it is blocked".\n' };
  if (options.assignee && doc.kind !== 'story') return { code: 2, out: '--assignee only applies to stories.\n' };

  const outcome = transaction(root, today, () => {
    let text = setField(doc.text, 'status', status);
    if (doc.kind === 'story') {
      if (status === 'blocked') text = setField(text, 'blocked_reason', yamlString(options.reason!));
      else if (current === 'blocked') text = setField(text, 'blocked_reason', 'null');
      if (options.assignee) text = setField(text, 'assignee', yamlString(options.assignee));
    }
    writeFileSync(join(root, doc.file), setField(text, 'updated', today));
  });
  if (!outcome.ok) return { code: 1, out: `Can't move ${target} to ${status}; it would break these rules:\n${describeErrors(outcome.errors)}\n` };
  return { code: 0, out: `${target}: ${current} -> ${status}\n` };
}
