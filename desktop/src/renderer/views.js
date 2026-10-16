// The planning views: sprint, backlog, board, epics, documents, checks. Each one
// returns { html, bind(el) }; `ctx` gives them navigation and the agent chat.
import { STATUS_LABEL, BOARD_COLUMNS, burndown, colorOfEpic, currentSprint, epicsOf, fmtDate, sprintStories, sprintsOf, storiesOf } from './data.js';
import { closePop, esc, icon, initials, navIcon, personColor, plural, showPop } from './ui.js';

const statusPill = s => `<span class="pill" data-s="${esc(s)}">${esc(STATUS_LABEL[s] ?? s)}</span>`;
const person = (p, id) => (p.team?.team ?? []).find(m => m.id === id)?.name ?? id;
const avatar = (p, id) => id
  ? `<span class="av" style="background:${personColor(id)}" title="${esc(person(p, id))}">${esc(initials(person(p, id)))}</span>`
  : '<span class="av none" title="Unassigned">?</span>';
const epicDot = (p, id) => (id ? `<i class="edot" style="background:${colorOfEpic(id)}"></i>` : '');
const epicName = (p, id) => epicsOf(p).find(e => e.id === id)?.title ?? '';

function storyRow(p, s, { draggable = false } = {}) {
  const ec = s.epic ? colorOfEpic(s.epic) : null;
  return `<div class="srow" data-doc="${esc(s.path)}" tabindex="0" role="button">
    <span class="sid">${esc(s.id)}</span>
    <span class="stitle">${esc(s.title)}${s.type === 'bug' ? ' <span class="pill" data-s="blocked">bug</span>' : ''}</span>
    ${s.epic ? `<span class="epic-chip" style="--c:${ec}" title="${esc(epicName(p, s.epic))}">${esc(epicName(p, s.epic) || s.epic)}</span>` : '<span class="epic-chip empty"></span>'}
    ${statusPill(s.status)}
    <span class="pts" title="Story points">${s.points ?? '–'}</span>
    ${avatar(p, s.assignee)}</div>`;
}

const bindDocs = (el, ctx, full = false) => el.querySelectorAll('[data-doc]').forEach(r => {
  r.onclick = () => ctx.openDoc(r.dataset.doc, { full });
  r.onkeydown = e => { if (e.key === 'Enter') ctx.openDoc(r.dataset.doc, { full }); };
});

/* ---------- sprint ---------- */
export function sprintView(p, ctx) {
  const sprints = sprintsOf(p);
  if (!p.info.hasCli) return { html: '<div class="page"><div class="empty"><b>The scrumo CLI isn\'t installed here</b>Sprint views need the project\'s own scrumo CLI.</div></div>' };
  if (!sprints.length) {
    return { html: `<div class="page"><div class="empty"><b>No sprints yet</b>Plan the first sprint with your team.<br><br><button class="btn primary" data-act="plan">Plan Sprint 1</button></div></div>`,
      bind: el => el.querySelector('[data-act=plan]').onclick = () => ctx.go('planning') };
  }
  const sp = sprints.find(s => s.number === p.sprintShown) ?? currentSprint(p);
  const stories = sprintStories(p, sp.number);
  const burn = burndown(p, sp);
  const by = st => stories.filter(s => s.status === st);
  const pts = list => list.reduce((n, s) => n + (s.points ?? 0), 0);
  const expected = sp.pace ? Math.round((sp.pace.expectedPct / 100) * sp.points) : null;
  const blocked = by('blocked');
  const verdict = sp.pace?.verdict ?? sp.status;
  const days = sp.days;
  const attention = (p.status?.attention ?? []).slice(0, 4);

  const segs = [['done', 'Done'], ['in-qa', 'In QA'], ['in-progress', 'In progress'], ['ready', 'Ready'], ['blocked', 'Blocked'], ['draft', 'Draft']]
    .map(([k, label]) => ({ k, label, n: pts(by(k)) })).filter(x => x.n > 0);
  const total = Math.max(1, segs.reduce((n, x) => n + x.n, 0));

  const html = `<div class="page wide">
    <div class="page-head">
      <div>
        <div class="title-row"><h1>Sprint ${sp.number}</h1><span class="pill" data-s="${esc(verdict)}">${esc(STATUS_LABEL[verdict] ?? verdict)}</span></div>
        <div class="muted">${esc(sp.goal)} · ${fmtDate(sp.start)} – ${fmtDate(sp.end)}</div>
      </div>
      <div class="head-actions">
        ${sprints.length > 1 ? `<select id="sprintPick" aria-label="Sprint">${sprints.map(s => `<option value="${s.number}" ${s.number === sp.number ? 'selected' : ''}>Sprint ${s.number} · ${STATUS_LABEL[s.status]}</option>`).join('')}</select>` : ''}
        <button class="btn" data-act="ask" title="Ask the agent about this sprint">${icon('chat', 15)} Ask the agent</button>
        ${sp.status === 'planned' ? `<button class="btn primary" data-act="start">Start Sprint ${sp.number}</button>` : '<button class="btn primary" data-act="plan">Plan next sprint</button>'}
      </div>
    </div>

    <div class="kpis">
      <div class="card kpi"><span class="lab">Points done</span><b>${pts(by('done'))} <small>of ${pts(stories)}</small></b><span class="muted small">${expected == null ? STATUS_LABEL[sp.status] : `Should be ${expected} by now`}</span></div>
      <div class="card kpi"><span class="lab">Stories done</span><b>${by('done').length} <small>of ${stories.length}</small></b><span class="muted small">${by('in-qa').length} in QA · ${by('in-progress').length} in progress</span></div>
      <div class="card kpi"><span class="lab">Days left</span><b>${days ? days.left : '–'} <small>${days ? `of ${days.total}` : ''}</small></b><span class="muted small">Ends ${fmtDate(sp.end)}</span></div>
      <div class="card kpi ${blocked.length ? 'bad' : ''}"><span class="lab">Blocked</span><b>${blocked.length}</b><span class="muted small">${blocked.length ? esc(blocked[0].id + ' ' + (blocked[0].reason ?? '').slice(0, 60)) : 'Nothing is waiting'}</span></div>
    </div>

    <div class="two">
      <div class="card pad">
        <div class="row between"><b>Burndown</b>
          <span class="legend"><i class="l-ideal"></i>Ideal <i class="l-actual"></i>Actual <i class="l-proj"></i>Projected</span>
          ${burn.total && burn.todayIndex && burn.remaining > burn.idealNow ? `<span class="pill" data-s="at risk">${burn.short ? `About ${plural(burn.short, 'point')} short at this pace` : 'Behind the ideal line'}</span>` : ''}</div>
        ${burn.total ? burnSvg(burn) : '<div class="empty small">Give the stories points to see the burndown.</div>'}
        <div class="muted small">Counts a story as finished on the day its status last changed to done.</div>
      </div>
      <div class="col">
        <div class="card pad"><b>Where the points are</b>
          <div class="stack">${segs.map(x => `<i style="flex:${x.n};background:var(--s-${x.k === 'in-qa' ? 'qa' : x.k === 'in-progress' ? 'progress' : x.k === 'blocked' ? 'blocked' : x.k === 'done' ? 'done' : x.k === 'ready' ? 'ready' : 'draft'})" title="${esc(x.label)} ${x.n}"></i>`).join('')}</div>
          <div class="legend-grid">${segs.map(x => `<span><i data-s="${x.k}" class="sdot"></i>${esc(x.label)} · ${x.n}</span>`).join('') || '<span class="muted">No points yet</span>'}</div>
        </div>
        <div class="card pad"><b>Needs attention</b>
          ${attention.length ? attention.map(a => `<div class="attn"><i class="sdot" data-s="${/blocked|overdue|bug/i.test(a) ? 'blocked' : 'in-progress'}"></i><span>${esc(a)}</span></div>`).join('') : '<div class="muted small">Nothing needs attention.</div>'}
        </div>
      </div>
    </div>

    <div class="card list">
      <div class="list-head"><b>Stories in this sprint</b><span class="muted small">${plural(stories.length, 'story', 'stories')} · ${plural(pts(stories), 'point')}</span></div>
      ${stories.length ? stories.map(s => storyRow(p, s)).join('') : '<div class="empty small">No stories in this sprint.</div>'}
    </div>
  </div>`;
  return {
    html,
    bind(el) {
      bindDocs(el, ctx);
      el.querySelector('#sprintPick')?.addEventListener('change', e => { p.sprintShown = +e.target.value; ctx.render(); });
      el.querySelector('[data-act=plan]')?.addEventListener('click', () => ctx.go('planning'));
      el.querySelector('[data-act=start]')?.addEventListener('click', () => ctx.run(p, ['sprint', 'start', String(sp.number)]));
      el.querySelector('[data-act=ask]').onclick = () => ctx.chatWith('scrumo-sprint', `How is Sprint ${sp.number} going, and what should we do about it?`);
    },
  };
}

function burnSvg(b) {
  const W = 780, H = 300, x0 = 50, x1 = 730, y0 = 20, y1 = 260;
  const n = b.days.length;
  const X = i => x0 + ((x1 - x0) * i) / n;
  const Y = v => y1 - ((y1 - y0) * v) / b.total;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(b.total * f * 10) / 10);
  let actual = `M${X(0)} ${Y(b.total)}`;
  let prev = b.total;
  for (const a of b.actual) { actual += ` H${X(a.i - 1)} V${Y(a.remaining)}`; prev = a.remaining; }
  if (b.actual.length) actual += ` H${X(b.actual.length)}`;
  const t = b.todayIndex;
  const label = i => b.days[Math.max(0, Math.min(n - 1, i - 1))].slice(5).replace('-', '/');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Burndown chart: ${b.remaining} of ${b.total} points remaining" class="burn">
    ${ticks.map(v => `<line x1="${x0}" y1="${Y(v)}" x2="${x1}" y2="${Y(v)}" class="grid"/><text x="40" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join('')}
    ${[0, Math.floor(n / 2), n].map(i => `<text x="${X(i)}" y="282" text-anchor="middle" class="ax">${i === 0 ? 'Start' : label(i)}</text>`).join('')}
    ${t > 0 ? `<rect x="${X(t)}" y="${y0 - 6}" width="${x1 - X(t)}" height="${y1 - y0 + 6}" class="future"/>` : ''}
    <line x1="${X(0)}" y1="${Y(b.total)}" x2="${x1}" y2="${y1}" class="ideal"/>
    ${b.actual.length ? `<path d="${actual}" class="actual"/>` : ''}
    ${t > 0 && t < n ? `<path d="M${X(t)} ${Y(prev)} L${x1} ${Y(b.projectedEnd)}" class="proj"/>` : ''}
    ${t > 0 ? `<line x1="${X(t)}" y1="${y0 - 6}" x2="${X(t)}" y2="${y1}" class="today"/><circle cx="${X(t)}" cy="${Y(b.remaining)}" r="6" class="dotnow"/><text x="${X(t) + 8}" y="${Y(b.remaining) - 8}" class="lbl">${b.remaining} left</text>` : ''}
  </svg>`;
}

/* ---------- backlog ---------- */
const FILTER_DEFAULT = () => ({ q: '', epics: new Set(), statuses: new Set(), assignees: new Set(), hideDone: true });

export function backlogView(p, ctx) {
  p.filters ??= FILTER_DEFAULT();
  const f = p.filters;
  const all = storiesOf(p).filter(s => s.status !== 'cancelled');
  const match = s => (!f.q || `${s.id} ${s.title}`.toLowerCase().includes(f.q.toLowerCase()))
    && (!f.epics.size || f.epics.has(s.epic ?? 'none'))
    && (!f.statuses.size || f.statuses.has(s.status))
    && (!f.assignees.size || f.assignees.has(s.assignee ?? 'none'))
    && !(f.hideDone && s.status === 'done');
  const shown = all.filter(match);
  const sprints = sprintsOf(p);
  const sections = [
    ...sprints.filter(s => s.status !== 'closed').map(s => ({ key: s.number, title: `Sprint ${s.number}`, tag: `<span class="pill" data-s="${s.status === 'active' ? 'in-progress' : 'draft'}">${STATUS_LABEL[s.status]} · ${fmtDate(s.start)} – ${fmtDate(s.end)}</span>`, list: shown.filter(x => x.sprint === s.number), all: all.filter(x => x.sprint === s.number) })),
    { key: 'backlog', title: 'Backlog', tag: '', list: shown.filter(x => x.sprint == null), all: all.filter(x => x.sprint == null) },
    ...sprints.filter(s => s.status === 'closed').map(s => ({ key: s.number, title: `Sprint ${s.number}`, tag: '<span class="pill" data-s="done">Closed</span>', list: shown.filter(x => x.sprint === s.number), all: all.filter(x => x.sprint === s.number), collapsed: true })),
  ];
  p.collapsed ??= new Set(sections.filter(s => s.collapsed).map(s => s.key));
  const epics = epicsOf(p);
  const active = f.epics.size || f.statuses.size || f.assignees.size || f.q || !f.hideDone;
  const chip = (label, set, key) => set.size
    ? `<span class="fchip on" data-f="${key}"><span>${label}: ${set.size === 1 ? esc([...set][0] === 'none' ? 'None' : labelFor(p, key, [...set][0])) : set.size + ' selected'}</span><button class="fx" data-clear="${key}" aria-label="Clear ${label}">${icon('x', 11)}</button></span>`
    : `<span class="fchip" data-f="${key}">${label}${icon('chevron', 12)}</span>`;

  const html = `<div class="split-page">
    <aside class="epic-panel">
      <div class="lab">Epics</div>
      <button class="epic-item ${f.epics.size ? '' : 'on'}" data-epic="">All epics<span>${all.length}</span></button>
      ${epics.map(e => `<button class="epic-item ${f.epics.has(e.id) ? 'on' : ''}" data-epic="${esc(e.id)}">
        <div class="row"><i class="edot" style="background:${colorOfEpic(e.id)}"></i><b>${esc(e.title)}</b><span class="mono small">${esc(e.id)}</span></div>
        <div class="bar"><i style="width:${e.points ? Math.round((100 * e.donePoints) / e.points) : 0}%;background:${colorOfEpic(e.id)}"></i></div>
        <div class="muted small">${e.doneStories} of ${plural(e.stories, 'story', 'stories')} done</div></button>`).join('')}
    </aside>
    <div class="backlog-main">
      <div class="page-head"><div><h1>Backlog</h1></div>
        <button class="btn primary" id="newStory" title="Opens the chat with the ${esc(ctx.skillRole('scrumo-stories'))} agent">${icon('plus', 15)} New story<span class="tag">${esc(ctx.skillRole('scrumo-stories'))}</span></button></div>
      <div class="filters">
        <label class="search">${icon('search', 15)}<input id="bq" placeholder="Search title or ID" value="${esc(f.q)}"></label>
        <span class="vsep"></span>
        ${chip('Epic', f.epics, 'epics')}${chip('Status', f.statuses, 'statuses')}${chip('Assignee', f.assignees, 'assignees')}
        <label class="switch"><input type="checkbox" id="hideDone" ${f.hideDone ? 'checked' : ''}><i></i>Hide done</label>
        <span class="grow"></span>
        <span class="muted small">Showing <b>${shown.length}</b> of ${all.length}${active ? ' · <button class="link" id="clearAll">Clear filters</button>' : ''}</span>
      </div>
      ${sections.map(s => `<div class="card list">
        <button class="list-head sec" data-sec="${s.key}">${icon('chevron', 14, p.collapsed.has(s.key) ? 'style="transform:rotate(-90deg)"' : '')}<b>${esc(s.title)}</b>${s.tag}
          <span class="grow"></span><span class="muted small">${plural(s.list.length, 'story', 'stories')} · ${plural(s.list.reduce((n, x) => n + (x.points ?? 0), 0), 'point')}</span></button>
        ${p.collapsed.has(s.key) ? '' : (s.list.length ? s.list.map(x => storyRow(p, x)).join('') : `<div class="empty small">${s.all.length ? 'No stories match the filters.' : s.key === 'backlog' ? 'The backlog is empty.' : 'No stories yet.'}</div>`)}
      </div>`).join('')}
    </div></div>`;

  return {
    html,
    bind(el) {
      bindDocs(el, ctx);
      const rerender = () => ctx.render();
      el.querySelector('#bq').addEventListener('input', e => { f.q = e.target.value; rerender(); const i = $q(el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
      el.querySelector('#hideDone').onchange = e => { f.hideDone = e.target.checked; rerender(); };
      el.querySelector('#clearAll')?.addEventListener('click', () => { p.filters = FILTER_DEFAULT(); rerender(); });
      el.querySelector('#newStory').onclick = () => ctx.chatWith('scrumo-stories', 'New story: ');
      el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { const k = b.dataset.sec; const key = isNaN(+k) ? k : +k; p.collapsed.has(key) ? p.collapsed.delete(key) : p.collapsed.add(key); rerender(); });
      el.querySelectorAll('[data-epic]').forEach(b => b.onclick = () => { f.epics = b.dataset.epic ? new Set(f.epics.has(b.dataset.epic) && f.epics.size === 1 ? [] : [b.dataset.epic]) : new Set(); rerender(); });
      el.querySelectorAll('[data-clear]').forEach(b => b.onclick = e => { e.stopPropagation(); f[b.dataset.clear] = new Set(); rerender(); });
      el.querySelectorAll('.fchip').forEach(c => c.onclick = e => { if (!e.target.closest('.fx')) filterMenu(p, ctx, c, c.dataset.f, all, epics); });
    },
  };
}
const $q = el => el.querySelector('#bq');
const labelFor = (p, key, v) => key === 'epics' ? epicName(p, v) || v : key === 'assignees' ? person(p, v) : STATUS_LABEL[v] ?? v;

function filterMenu(p, ctx, anchor, key, all, epics) {
  const f = p.filters;
  const opts = key === 'epics' ? [...epics.map(e => ({ v: e.id, label: e.title, dot: colorOfEpic(e.id), n: all.filter(s => s.epic === e.id).length })), { v: 'none', label: 'No epic', n: all.filter(s => !s.epic).length }]
    : key === 'statuses' ? ['draft', 'ready', 'in-progress', 'in-qa', 'done', 'blocked'].map(v => ({ v, label: STATUS_LABEL[v], n: all.filter(s => s.status === v).length }))
      : [...(p.team?.team ?? []).map(m => ({ v: m.id, label: m.name, n: all.filter(s => s.assignee === m.id).length })), { v: 'none', label: 'Unassigned', n: all.filter(s => !s.assignee).length }];
  const title = { epics: 'Show stories from', statuses: 'Status', assignees: 'Assigned to' }[key];
  const pop = showPop(anchor, `<div class="menu"><div class="lab">${title}</div>${opts.map(o => `<label class="mrow ${f[key].has(o.v) ? 'on' : ''}"><input type="checkbox" value="${esc(o.v)}" ${f[key].has(o.v) ? 'checked' : ''}>${o.dot ? `<i class="edot" style="background:${o.dot}"></i>` : ''}<span>${esc(o.label)}</span><em>${o.n}</em></label>`).join('')}
    <div class="mfoot"><button class="link" data-all>Select all</button><button class="link" data-none>Clear</button></div></div>`, { width: 270 });
  const apply = () => { f[key] = new Set([...pop.querySelectorAll('input:checked')].map(i => i.value)); closePop(); ctx.render(); };
  pop.querySelectorAll('input').forEach(i => i.onchange = apply);
  pop.querySelector('[data-all]').onclick = () => { pop.querySelectorAll('input').forEach(i => { i.checked = true; }); apply(); };
  pop.querySelector('[data-none]').onclick = () => { pop.querySelectorAll('input').forEach(i => { i.checked = false; }); apply(); };
}

/* ---------- board ---------- */
export function boardView(p, ctx) {
  const sp = currentSprint(p);
  if (!sp) return { html: '<div class="page"><div class="empty"><b>No sprint yet</b>The board shows the stories of the active sprint.</div></div>' };
  const stories = sprintStories(p, sp.number);
  const cols = [...BOARD_COLUMNS, ...(stories.some(s => s.status === 'blocked') ? ['blocked'] : [])];
  const html = `<div class="page wide"><div class="page-head"><div><div class="title-row"><h1>Board</h1></div><div class="muted">Sprint ${sp.number} · ${esc(sp.goal)}</div></div></div>
    <div class="board" style="--cols:${cols.length}">${cols.map(c => {
    const list = stories.filter(s => s.status === c);
    return `<div class="bcol"><div class="bhead">${statusPill(c)}<span class="muted small">${list.length} · ${list.reduce((n, s) => n + (s.points ?? 0), 0)} pts</span></div>
        ${list.map(s => `<div class="bcard" data-doc="${esc(s.path)}" tabindex="0" role="button"><div class="row"><span class="sid">${esc(s.id)}</span><span class="grow"></span>${epicDot(p, s.epic)}</div><div>${esc(s.title)}</div>
          ${s.reason ? `<div class="muted small">${esc(s.reason)}</div>` : ''}<div class="row"><span class="pts">${s.points ?? '–'}</span><span class="grow"></span>${avatar(p, s.assignee)}</div></div>`).join('') || '<div class="muted small pad">Nothing here</div>'}</div>`;
  }).join('')}</div></div>`;
  return { html, bind: el => bindDocs(el, ctx) };
}

/* ---------- epics ---------- */
export function epicsView(p, ctx) {
  const epics = epicsOf(p);
  const html = `<div class="page"><div class="page-head"><div><div class="title-row"><h1>Epics</h1></div><div class="muted">Bigger pieces of the product, and how far along each one is.</div></div></div>
    ${epics.map(e => `<div class="card pad epic-card" data-doc="${esc(e.path)}" tabindex="0" role="button">
      <div class="row"><i class="edot big" style="background:${colorOfEpic(e.id)}"></i><b>${esc(e.title)}</b><span class="mono small muted">${esc(e.id)}</span>${statusPill(e.status)}<span class="grow"></span>
        <button class="btn small" data-filter="${esc(e.id)}">See stories</button></div>
      <div class="bar"><i style="width:${e.points ? Math.round((100 * e.donePoints) / e.points) : 0}%;background:${colorOfEpic(e.id)}"></i></div>
      <div class="muted small">${e.doneStories} of ${plural(e.stories, 'story', 'stories')} done · ${e.donePoints} of ${plural(e.points, 'point')}</div></div>`).join('') || '<div class="empty"><b>No epics yet</b>Ask the agent to break the PRD into epics.</div>'}</div>`;
  return {
    html,
    bind(el) {
      bindDocs(el, ctx);
      el.querySelectorAll('[data-filter]').forEach(b => b.onclick = e => { e.stopPropagation(); p.filters = FILTER_DEFAULT(); p.filters.epics = new Set([b.dataset.filter]); ctx.go('backlog'); });
    },
  };
}

/* ---------- documents ---------- */
export function docsView(p, ctx) {
  const q = (p.docQuery ?? '').toLowerCase();
  const ORDER = ['docs/brief.md', 'docs/prd.md', 'docs/architecture.md', 'docs/coding-standards.md', 'docs/sprint-tracker.md'];
  const group = (label, list) => list.length ? `<div class="card list"><div class="list-head"><b>${label}</b><span class="muted small">${list.length}</span></div>${list.map(d => `<div class="srow doc" data-doc="${esc(d.path)}" tabindex="0" role="button"><span class="sdot" data-s="${esc(d.meta.status)}"></span><span class="sid">${esc(d.meta.id ?? '')}</span><span class="stitle">${esc(d.meta.title || d.path)}</span>${d.meta.status ? statusPill(d.meta.status) : ''}${p.git?.files?.some(f => f.path === d.path) ? '<span class="edited">unsaved</span>' : ''}</div>`).join('')}</div>` : '';
  const hit = d => !q || `${d.meta.id ?? ''} ${d.meta.title ?? ''} ${d.path}`.toLowerCase().includes(q);
  const planning = p.docs.filter(d => !d.path.includes('/epics/') && !d.path.includes('/stories/')).sort((a, b) => (ORDER.indexOf(a.path) + 1 || 99) - (ORDER.indexOf(b.path) + 1 || 99)).filter(hit);
  const html = `<div class="page"><div class="page-head"><div><div class="title-row"><h1>Documents</h1></div><div class="muted">Everything under docs/, as the agent and your team see it.</div></div>
    <label class="search">${icon('search', 15)}<input id="dq" placeholder="Search documents" value="${esc(p.docQuery ?? '')}"></label></div>
    ${group('Planning', planning)}${group('Epics', p.docs.filter(d => d.path.includes('/epics/')).filter(hit))}${group('Stories and bugs', p.docs.filter(d => d.path.includes('/stories/')).filter(hit))}</div>`;
  return {
    html,
    bind(el) {
      bindDocs(el, ctx, true);
      el.querySelector('#dq').addEventListener('input', e => { p.docQuery = e.target.value; ctx.render(); const i = el.querySelector('#dq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    },
  };
}

/* ---------- checks ---------- */
export function checksView(p, ctx) {
  const v = p.validation;
  const html = `<div class="page"><div class="page-head"><div><div class="title-row"><h1>Checks</h1></div><div class="muted">What <span class="mono">scrumo validate</span> found in the documents.</div></div><button class="btn" id="recheck">Check again</button></div>
    ${!v ? '<div class="empty">Not checked yet.</div>' : v.findings.length ? v.findings.map(f => `<div class="finding ${esc(f.severity)}"><div class="code">${esc(f.code)} · ${esc(f.severity)}</div><div>${esc(f.message)}</div><div class="file">${esc(f.file)}${f.line ? ':' + f.line : ''}</div></div>`).join('')
      : `<div class="note ok">No problems. ${v.files} files checked.</div>`}</div>`;
  return { html, bind: el => { el.querySelector('#recheck').onclick = () => ctx.refreshChecks(p); } };
}
export { navIcon };
