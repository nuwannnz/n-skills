// The permission level, as a select. Shown in the chat box and in Settings; both change the same saved setting.
import { useApp } from '../../app/store';
import type { Permissions } from '../../lib/types';
import { setPermissions } from './actions';

export const PERMISSION_OPTIONS: { value: Permissions; name: string; description: string }[] = [
  { value: 'ask', name: 'Ask', description: 'Ask before editing documents or running commands' },
  { value: 'edits', name: 'Accept edits', description: 'Edit documents under docs/ without asking; commands still ask' },
  { value: 'auto', name: 'Auto', description: 'Edit documents and run commands without asking. Deleting files, git push and similar still ask' },
];

export function PermissionSelect({ id }: { id?: string }) {
  const mode = useApp(s => s.permissions);
  return (
    <select id={id} aria-label="Permissions" value={mode} title={PERMISSION_OPTIONS.find(o => o.value === mode)?.description}
      onChange={e => setPermissions(e.target.value as Permissions)}>
      {PERMISSION_OPTIONS.map(o => <option key={o.value} value={o.value} title={o.description}>{o.name}</option>)}
    </select>
  );
}
