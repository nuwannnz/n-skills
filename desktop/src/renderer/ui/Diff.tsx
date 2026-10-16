import { cx } from './cx';

const Lines = ({ text, cls }: { text: string; cls: string }) => <>{String(text).split('\n').map((l, i) => <div key={i} className={cls}>{l || ' '}</div>)}</>;

/** Old text struck out above the new text. */
export const Diff = ({ before, after }: { before?: string; after: string }) => (
  <div className="diff">{before ? <Lines text={before} cls="del" /> : null}<Lines text={after} cls="add" /></div>
);

/** A `git diff` output, without its headers. */
export const UnifiedDiff = ({ text }: { text: string }) => (
  <div className="diff">
    {String(text).split('\n').filter(l => !/^(diff --git|index |new file|deleted file|--- |\+\+\+ )/.test(l)).map((l, i) => (
      <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}>{l.replace(/^[+-]/, '') || ' '}</div>
    ))}
  </div>
);

/** A command or other literal text in the diff box style. */
export const CodeBox = ({ text, command }: { text: string; command?: boolean }) => (
  <div className={cx('diff', command && 'cmd')}><div>{text}</div></div>
);
