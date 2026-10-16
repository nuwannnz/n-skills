// ⌘K: find any story, epic or document of the open project.
import { useState } from 'react';
import { setApp, useApp, type ProjectView } from '../../app/store';
import { epicsOf, isEpic, isStory, storiesOf } from '../../lib/data';
import { cx, Empty, Pill } from '../../ui';
import { openDoc } from '../workspace/navigation';

const close = () => setApp(s => { s.paletteOpen = false; });

export function Palette({ p }: { p: ProjectView }) {
  const open = useApp(s => s.paletteOpen);
  if (!open) return null;
  return <PaletteBody p={p} />;
}

function PaletteBody({ p }: { p: ProjectView }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const items = [
    ...storiesOf(p).map(s => ({ label: s.title, id: s.id, path: s.path, status: s.status })),
    ...epicsOf(p).map(e => ({ label: e.title, id: e.id, path: e.path, status: e.status })),
    ...p.docs.filter(d => !isStory(d.path) && !isEpic(d.path)).map(d => ({ label: d.meta.title || d.path, id: '', path: d.path, status: d.meta.status })),
  ];
  const query = q.toLowerCase();
  const list = items.filter(i => !query || `${i.id} ${i.label}`.toLowerCase().includes(query)).slice(0, 30);
  const at = Math.min(sel, Math.max(0, list.length - 1));
  const pick = (n: number) => { const i = list[n]; if (!i) return; close(); openDoc(i.path); };
  return (
    <div className="palette-wrap" id="palette" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-label="Find a story or document">
        <input id="paletteInput" placeholder="Find a story or document" autoComplete="off" autoFocus value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') { setSel(Math.min(at + 1, list.length - 1)); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setSel(Math.max(at - 1, 0)); e.preventDefault(); }
            else if (e.key === 'Enter') pick(at);
          }} />
        <div className="palette-list">
          {list.length ? list.map((i, n) => (
            <button type="button" key={i.path} className={cx(n === at && 'on')} onClick={() => pick(n)}>
              <span className="mono small muted" style={{ width: 56 }}>{i.id}</span><span style={{ flex: 1 }}>{i.label}</span>
              {i.status ? <Pill status={i.status}>{i.status}</Pill> : null}
            </button>
          )) : <Empty small>Nothing found.</Empty>}
        </div>
      </div>
    </div>
  );
}
