// A side drawer for a story or an epic, so you can read it without leaving the view you were in.
import { STATUS_LABEL, colorOfEpic, epicsOf, fmtDate, sprintsOf, storiesOf } from './data.js';
import { ago, esc, hue, icon, initials, md, personColor } from './ui.js';

const person = (p, id) => (p.team?.team ?? []).find(m => m.id === id)?.name ?? id;
const pill = s => `<span class="pill" data-s="${esc(s)}">${esc(STATUS_LABEL[s] ?? s)}</span>`;
const clean = v => (v == null || v === 'null' || v === '' ? null : v);

export function drawerView(p, path, ctx) {
  const d = p.docs.find(x => x.path === path);
  if (!d) return { html: '<div class="drawer-body"><div class="empty small">That document isn\'t there any more.</div></div>' };
  const isEpic = path.includes('/epics/');
  const stories = storiesOf(p);
  const epic = clean(d.meta.epic) ? epicsOf(p).find(e => e.id === d.meta.epic) : null;
  const sprint = clean(d.meta.sprint);
  const assignee = clean(d.meta.assignee);
  const reason = clean(d.meta.reason);
  const deps = (clean(d.meta.depends_on) ?? '').replace(/[\[\]]/g, '').split(',').map(x => x.trim()).filter(Boolean);
  const find = id => stories.find(s => s.id === id);
  const child = isEpic ? stories.filter(s => s.epic === d.meta.id && s.status !== 'cancelled') : [];
  const prop = (label, html) => `<div class="dprop"><span class="lab">${label}</span><div>${html}</div></div>`;
  const link = (id, label) => { const t = find(id) ?? epicsOf(p).find(e => e.id === id); return t ? `<button class="chipbtn" data-peek="${esc(t.path)}">${esc(label ?? id)}</button>` : `<span class="muted">${esc(id)}</span>`; };

  const html = `<div class="drawer-head">
      ${p.peekTrail?.length ? `<button class="icon-btn" id="peekBack" title="Back" aria-label="Back">${icon('chevron', 16, 'style="transform:rotate(90deg)"')}</button>` : ''}
      <span class="mono small muted">${esc(d.meta.id ?? '')}</span>${d.meta.status ? pill(d.meta.status) : ''}${d.meta.type === 'bug' ? '<span class="pill" data-s="blocked">bug</span>' : ''}
      <span class="grow"></span>
      <button class="icon-btn" id="peekFull" title="Open as a full document" aria-label="Open as a full document">${icon('split', 17).replace('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M10 4v16"/>', '<path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8"/>')}</button>
      <button class="icon-btn" id="peekClose" title="Close (Esc)" aria-label="Close">${icon('x', 17)}</button></div>
    <div class="drawer-body">
      <h2 class="dtitle">${esc(d.meta.title || path)}</h2>
      <div class="dprops">
        ${epic ? prop('Epic', `<span class="epicline"><i class="edot" style="background:${colorOfEpic(epic.id)}"></i>${link(epic.id, epic.title)}</span>`) : ''}
        ${clean(d.meta.points) != null ? prop('Points', esc(d.meta.points)) : ''}
        ${prop('Assignee', assignee ? `<span class="who inline"><span class="av" style="background:${personColor(assignee)}">${esc(initials(person(p, assignee)))}</span>${esc(person(p, assignee))}</span>` : '<span class="muted">Unassigned</span>')}
        ${sprint ? prop('Sprint', `Sprint ${esc(sprint)}${sprintsOf(p).find(s => s.number === +sprint) ? ` · ${fmtDate(sprintsOf(p).find(s => s.number === +sprint).start)} – ${fmtDate(sprintsOf(p).find(s => s.number === +sprint).end)}` : ''}`) : ''}
        ${clean(d.meta.priority) ? prop('Priority', esc(d.meta.priority)) : ''}
        ${deps.length ? prop('Depends on', deps.map(id => link(id)).join(' ')) : ''}
      </div>
      ${reason ? `<div class="note bad"><b>Blocked.</b> ${esc(reason)}</div>` : ''}
      ${isEpic ? `<div class="dchildren"><div class="lab">Stories (${child.length})</div>${child.map(s => `<button class="chiprow" data-peek="${esc(s.path)}"><span class="sid">${esc(s.id)}</span><span class="stitle">${esc(s.title)}</span>${pill(s.status)}<span class="pts">${s.points ?? '–'}</span></button>`).join('') || '<div class="muted small">No stories yet.</div>'}</div>` : ''}
      <div class="md dmd">${md(d.body)}</div>
    </div>
    <div class="drawer-foot"><span class="muted small" id="dbyline"></span><span class="grow"></span>
      <button class="btn small" id="peekAsk">${icon('chat', 14)} Ask the agent</button><button class="btn small primary" id="peekOpen">Open full document</button></div>`;

  return {
    html,
    bind(el) {
      el.querySelectorAll('.md table').forEach(t => { const w = document.createElement('div'); w.className = 'tbl'; t.replaceWith(w); w.appendChild(t); });
      el.querySelectorAll('[data-peek]').forEach(b => b.onclick = () => ctx.peek(b.dataset.peek, { push: true }));
      el.querySelector('#peekClose').onclick = () => ctx.closePeek();
      el.querySelector('#peekBack')?.addEventListener('click', () => ctx.peekBack());
      el.querySelector('#peekFull').onclick = el.querySelector('#peekOpen').onclick = () => ctx.openFull(path);
      el.querySelector('#peekAsk').onclick = () => ctx.chatWith(isEpic ? 'scrumo-stories' : 'scrumo-refine', `About ${d.meta.id} (${d.meta.title}): `);
      p.fileLogs ??= new Map();
      const show = log => { const b = el.querySelector('#dbyline'); if (b && log) b.innerHTML = `Last changed by <b>${esc(log.name)}</b> · ${esc(ago(log.at))}`; };
      if (p.fileLogs.has(path)) show(p.fileLogs.get(path));
      else ctx.api.git.fileLog(p.info.root, path).then(log => { p.fileLogs.set(path, log); show(log); });
    },
  };
}
