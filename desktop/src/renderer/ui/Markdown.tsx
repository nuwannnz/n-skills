import { useMemo, type Ref } from 'react';
import { markdown } from '../lib/markdown';
import { cx } from './cx';

/** Tables scroll sideways inside a wrapper instead of stretching the page. */
const wrapTables = (html: string) => html.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');

/** Rendered Markdown. `bare` leaves out the .md document styling (chat messages use their own). */
export function Markdown({ text, className, bare, ref }: { text: string; className?: string; bare?: boolean; ref?: Ref<HTMLDivElement> }) {
  const html = useMemo(() => wrapTables(markdown(text)), [text]);
  return <div ref={ref} className={cx(!bare && 'md', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
