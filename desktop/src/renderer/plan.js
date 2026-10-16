// Sprint planning: a screen meant to be shared in a meeting. Goal, capacity, then
// picking stories; "Create sprint" runs `scrumo sprint plan` with those choices.
import { colorOfEpic, currentSprint, epicsOf, fmtDate, nextSprintDates, sprintsOf, storiesOf } from './data.js';
import { esc, icon, initials, personColor, plural } from './ui.js';

const person = (p, id) => (p.team?.team ?? []).find(m => m.id === id)?.name ?? id;
const av = (p, id) => (id ? `<span class="av" style="background:${personColor(id)}" title="${esc(person(p, id))}">${esc(initials(person(p, id)))}</span>` : '<span class="av none" title="Unassigned">?</span>');

export function planningView(p, ctx) {
  const sprints = sprintsOf(p);
  const number = (sprints.at(-1)?.number ?? 0) + 1;
  const active = sprints.find(s => s.status === 'active');
  const dates = nextSprintDates(p, p.config?.length ?? 14, p.config?.weekday ?? 'monday');
  const team = p.team?.team ?? [];
  const teamCapacity = p.team?.capacity ?? 0;
  const pl = (p.plan ??= { number, goal: '', start: dates.start, end: dates.end, capacity: null, picked: null });
  if (pl.number !== number) Object.assign(pl, { number, goal: '', start: dates.start, end: dates.end, capacity: null, picked: null });
  const capacity = pl.capacity ?? teamCapacity ?? p.status?.velocity?.average ?? 0;

  const all = storiesOf(p).filter(s => s.status !== 'cancelled' && s.status !== 'done');
  const carried = active ? all.filter(s => s.sprint === active.number) : [];
  const backlog = all.filter(s => s.sprint == null).sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || a.id.localeCompare(b.id, undefined, { numeric: true }));
  pl.picked ??= new Set();
  const picked = all.filter(s => pl.picked.has(s.id));
  const pts = list => list.reduce((n, s) => n + (s.points ?? 0), 0);
  const committed = pts(picked);
  const over = capacity > 0 && committed > capacity;
  const unestimated = picked.filter(s => s.points == null);
  const ready = s => s.status === 'ready' && s.sprint == null; // only ready stories outside a sprint can be planned

  const row = (s, inSprint) => `<div class="prow ${!inSprint && !ready(s) ? 'dim' : ''}">
    <span class="sid">${esc(s.id)}</span><span class="stitle">${esc(s.title)}${s.epic ? ` <i class="edot" style="background:${colorOfEpic(s.epic)}" title="${esc(epicsOf(p).find(e => e.id === s.epic)?.title ?? '')}"></i>` : ''}</span>
    ${!inSprint && !ready(s) ? `<span class="pill" data-s="${esc(s.status)}" title="Get this story to ready before planning it">${esc(s.status)}</span>` : ''}
    <span class="pts" title="${s.points == null ? 'No estimate yet' : 'Story points'}">${s.points ?? '–'}</span>${inSprint ? av(p, s.assignee) : ''}
    ${inSprint ? `<button class="padd rm" data-rm="${esc(s.id)}" aria-label="Remove ${esc(s.id)} from the sprint" title="Remove from the sprint">${icon('x', 13)}</button>`
    : `<button class="padd" data-add="${esc(s.id)}" ${ready(s) ? '' : 'disabled'} aria-label="Add ${esc(s.id)} to the sprint" title="${ready(s) ? 'Add to the sprint' : 'Not ready to plan'}">${icon('plus', 14)}</button>`}</div>`;

  const html = `<div class="page wide plan">
    <div class="page-head">
      <div><div class="title-row"><h1>Plan Sprint ${number}</h1></div>
        <div class="muted big">${fmtDate(pl.start)} – ${fmtDate(pl.end)} · ${team.length ? `planning with ${esc(team.map(m => m.name.split(' ')[0]).join(', '))}` : 'no team members yet'}</div></div>
      <div class="head-actions">
        <button class="btn" id="suggest" title="The agent proposes a sprint for you to adjust"><span class="slash">/</span>Suggest a sprint<span class="tag">${esc(ctx.skillRole('scrumo-sprint'))}</span></button>
        <button class="btn primary big-btn" id="create" ${picked.length && pl.goal.trim() ? '' : 'disabled'} title="${pl.goal.trim() ? '' : 'Write a sprint goal first'}">Create Sprint ${number}</button>
      </div>
    </div>

    ${active ? `<div class="note warn">Sprint ${active.number} is still active (${active.donePoints} of ${active.points} points done). Its unfinished stories can only move to the next sprint once it is closed.
      <button class="link" id="closeActive">Close Sprint ${active.number} first</button></div>` : ''}

    <div class="card goal"><div class="row"><span class="lab">Sprint goal</span><span class="grow"></span>
      <label class="dates">From <input type="date" id="dStart" value="${esc(pl.start)}"></label><label class="dates">to <input type="date" id="dEnd" value="${esc(pl.end)}"></label></div>
      <input id="goal" placeholder="What should be true for users at the end of this sprint?" value="${esc(pl.goal)}" maxlength="200" autocomplete="off"></div>

    <div class="two even">
      <div class="card pad">
        <div class="row"><span class="lab">Capacity</span><span class="pill" data-s="${over ? 'blocked' : 'done'}">${over ? 'Over capacity' : committed ? 'On target' : 'Nothing planned yet'}</span><span class="grow"></span>
          <span class="cap"><b>${committed}</b> of <input id="cap" type="number" min="0" value="${capacity}" aria-label="Capacity in points"> points</span></div>
        <div class="gauge"><i class="${over ? 'over' : ''}" style="width:${capacity ? Math.min(100, Math.round((100 * committed) / capacity)) : 0}%"></i></div>
        <div class="muted small row between"><span>${p.status?.velocity?.average ? `Average velocity ${p.status.velocity.average}` : 'No finished sprints yet'}${p.status?.velocity?.history?.length ? ` · last ${p.status.velocity.history.slice(-3).join(', ')}` : ''}</span>
          <span>${unestimated.length ? `<span class="warn-text">${plural(unestimated.length, 'story', 'stories')} without points</span>` : 'Team capacity comes from the Team page'}</span></div>
      </div>
      <div class="card pad"><span class="lab">Who is on the team</span>
        <div class="people">${team.map(m => `<div class="person">${av(p, m.id)}<div><b>${esc(m.name.split(' ')[0])}</b><div class="muted small">${m.points == null ? 'not counted' : `${m.points} points`}</div></div></div>`).join('') || '<div class="muted small">Add people on the Team page.</div>'}</div>
      </div>
    </div>

    <div class="two even grow-cols">
      <div class="card list"><div class="list-head sec static"><b>Backlog</b><span class="muted small">ranked by priority · ${plural(backlog.filter(s => !pl.picked.has(s.id)).length, 'story', 'stories')}</span></div>
        ${carried.length ? `<div class="group-label warn">Unfinished in Sprint ${active.number} · close it to carry these over</div>${carried.map(s => row(s, false)).join('')}` : ''}
        ${carried.length ? '<div class="group-label">Backlog</div>' : ''}
        ${backlog.filter(s => !pl.picked.has(s.id)).map(s => row(s, false)).join('') || '<div class="empty small">The backlog is empty.</div>'}</div>
      <div class="card list picked"><div class="list-head sec static accent"><b>Sprint ${number}</b><span class="small">${plural(picked.length, 'story', 'stories')} · ${plural(committed, 'point')}${capacity ? ` · ${over ? `${committed - capacity} over` : `${capacity - committed} free`}` : ''}</span></div>
        ${picked.map(s => row(s, true)).join('')}
        ${picked.length ? '' : '<div class="empty small">Add stories from the backlog.</div>'}</div>
    </div></div>`;

  return {
    html,
    bind(el) {
      const again = () => ctx.render();
      el.querySelector('#goal').addEventListener('input', e => {
        pl.goal = e.target.value;
        el.querySelector('#create').disabled = !(picked.length && pl.goal.trim());
      });
      el.querySelector('#dStart').addEventListener('change', e => { pl.start = e.target.value || pl.start; again(); });
      el.querySelector('#dEnd').addEventListener('change', e => { pl.end = e.target.value || pl.end; again(); });
      el.querySelector('#cap').addEventListener('change', e => { pl.capacity = Math.max(0, +e.target.value || 0); again(); });
      el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { pl.picked.add(b.dataset.add); again(); });
      el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { pl.picked.delete(b.dataset.rm); again(); });
      el.querySelector('#suggest').onclick = () => ctx.chatWith('scrumo-sprint', `Suggest which stories to plan for Sprint ${number}. Team capacity is ${capacity} points.`);
      el.querySelector('#closeActive')?.addEventListener('click', async () => {
        if (!confirm(`Close Sprint ${active.number}? Unfinished stories go back to the backlog.`)) return;
        const r = await ctx.run(p, ['sprint', 'close', String(active.number)]);
        if (r.ok) { pl.picked = null; again(); }
      });
      el.querySelector('#create').onclick = async () => {
        const args = ['sprint', 'plan', '--goal', pl.goal.trim(), '--capacity', String(capacity), '--stories', [...pl.picked].join(','), '--start', pl.start, '--end', pl.end];
        const r = await ctx.run(p, args);
        if (r.ok) { p.plan = null; p.sprintShown = number; ctx.go('sprint'); }
      };
    },
  };
}
