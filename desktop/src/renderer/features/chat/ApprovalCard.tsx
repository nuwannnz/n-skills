// A step that needs the person's OK: an edit under docs/, a command, or another tool.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Pending } from '../../app/store';
import { Button, Check, CodeBox, Diff, Grow, Icon } from '../../ui';
import { openDoc } from '../workspace/navigation';
import { answerApproval, EDIT_TOOLS } from './actions';

const lineCount = (s: string | undefined) => (s ? String(s).split('\n').length : 0);

export function ApprovalCard({ root, card }: { root: string; card: Extract<Pending, { kind: 'approval' }> }) {
  const { toolName, input, file, exists } = card;
  const ref = useRef<HTMLElement>(null);
  const [auto, setAuto] = useState(false);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const isEdit = EDIT_TOOLS.includes(toolName);
  const docEdit = isEdit && file.startsWith('docs/');

  let title = `Allow ${toolName}?`;
  let sub: ReactNode = null;
  let body: ReactNode;
  let add = 0, del = 0;
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    const edits: { old_string?: string; new_string: string }[] = toolName === 'Edit' ? [input] : (input.edits ?? []);
    title = 'Allow this edit?';
    sub = <span className="mono">{file}</span>;
    body = edits.map((e, i) => <Diff key={i} {...(e.old_string ? { before: e.old_string } : {})} after={e.new_string} />);
    for (const e of edits) { add += lineCount(e.new_string); del += lineCount(e.old_string); }
  } else if (toolName === 'Write') {
    const lines = String(input.content ?? '').split('\n');
    title = exists ? 'Replace this document?' : 'Create this document?';
    sub = <><span className="mono">{file}</span>{lines.length > 60 ? ` · first 60 of ${lines.length} lines` : ''}</>;
    body = <Diff after={lines.slice(0, 60).join('\n')} />;
    add = lines.length;
  } else if (toolName === 'Bash') {
    title = 'Run this command?';
    sub = input.description ?? '';
    body = <CodeBox command text={input.command} />;
  } else body = <CodeBox text={JSON.stringify(input, null, 2)} />;

  return (
    <section className="ask pending" aria-label="Waiting for your approval" tabIndex={-1} ref={ref}>
      <div className="ask-head">
        <span className="ask-ic"><Icon name={toolName === 'Bash' ? 'bolt' : 'changes'} size={15} /></span>
        <div className="ask-title"><b>{title}</b>{sub ? <span className="muted small">{sub}</span> : null}</div>
        {isEdit ? <><span className="mono small ok-text">+{add}</span><span className="mono small muted">−{del}</span></> : null}
      </div>
      {body}
      <div className="ask-foot">
        {docEdit ? <Check small checked={auto} onChange={setAuto}>Don’t ask again for edits in docs/ during this chat</Check> : null}
        <Grow />
        {isEdit && exists ? <Button variant="ghost" size="small" className="view-doc" onClick={() => openDoc(file, { full: true })}>Open the document</Button> : null}
        <Button variant="deny" data-deny onClick={() => answerApproval(root, card, false, false)}>Deny</Button>
        <Button variant="primary" data-allow onClick={() => answerApproval(root, card, true, auto)}>{isEdit ? 'Allow edit' : toolName === 'Bash' ? 'Run it' : 'Allow'}</Button>
      </div>
    </section>
  );
}
