import { useMemo, type Ref } from 'react';
import { markdown } from '../lib/markdown';
import { cx } from './cx';

const TICKET_ID = /\b[A-Z][A-Z0-9]{0,9}-\d+\b/g;

/** Finishes rendered Markdown: tables scroll in their own box, and IDs like FR-001 never break at the hyphen. */
function tidy(html: string) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('table').forEach(table => { const w = document.createElement('div'); w.className = 'tbl'; table.replaceWith(w); w.appendChild(table); });
  const walk = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement?.closest('code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const hits: Text[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n as Text).data.search(TICKET_ID) >= 0) hits.push(n as Text);
  for (const n of hits) {
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of n.data.matchAll(TICKET_ID)) {
      frag.append(n.data.slice(at, m.index), Object.assign(document.createElement('span'), { className: 'tid', textContent: m[0] }));
      at = m.index + m[0].length;
    }
    frag.append(n.data.slice(at));
    n.replaceWith(frag);
  }
  return t.innerHTML;
}

/** Rendered Markdown. `bare` leaves out the .md document styling and the tidying (chat messages use their own). */
export function Markdown({ text, className, bare, ref }: { text: string; className?: string; bare?: boolean; ref?: Ref<HTMLDivElement> }) {
  const html = useMemo(() => (bare ? markdown(text) : tidy(markdown(text))), [text, bare]);
  return <div ref={ref} className={cx(!bare && 'md', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
