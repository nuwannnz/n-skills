import type { ProjectState } from '../../app/store';

/** The one thing a project's rail tile signals, most urgent first. */
export function attention(p: ProjectState) {
  if (p.chat.pending.length) return 'ask';
  if (p.chat.busy) return 'working';
  const prs = p.git?.prs ?? [];
  if (prs.some(x => x.status === 'changes')) return 'changes';
  if (prs.some(x => x.status === 'approved')) return 'approved';
  if (p.git?.files?.length) return 'unsaved';
  return '';
}

export const PR_LABEL: Record<string, string> = { review: 'Waiting for review', approved: 'Approved · ready to merge', changes: 'Changes requested' };
