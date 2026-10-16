// Team: the people in scrumo.yaml. Every change runs `scrumo team ...`, so it is
// validated by the CLI and shows up under Changes to be saved as a pull request.
import { ROLES, ROLE_LABEL } from './data.js';
import { closePop, esc, icon, initials, personColor, plural, showPop, toast } from './ui.js';

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';

export function teamView(p, ctx, { bare = false } = {}) {
  const team = p.team?.team ?? [];
  const me = (p.identity?.email ?? '').toLowerCase();
  const draft = (p.newMember ??= { name: '', email: '', roles: new Set(['dev']), points: '' });
  const changed = p.git?.files?.some(f => f.path === 'scrumo.yaml');
  const stories = ctx.storiesAssignedTo;

  const html = `<div class="page team ${bare ? 'bare' : ''}">
    ${bare ? '' : `<div class="page-head"><div><div class="title-row"><h1>Team</h1></div>
      <div class="muted">Everyone working on ${esc(p.info.name)}. This is the project's scrumo config, so changes are saved and reviewed like any other change.</div></div></div>`}
    ${changed && !bare ? '<div class="note ok">Team changes are not saved yet. Use <b>Save changes</b> to send them for review.</div>' : ''}
    <div class="card">
      <div class="mrow-h"><span class="lab">Member</span><span class="lab">Roles</span><span class="lab">Points per sprint</span><span></span></div>
      ${team.map(m => {
    const isMe = m.emails.some(e => e.toLowerCase() === me);
    const open = stories(p, m.id);
    return `<div class="mrow-t" data-id="${esc(m.id)}">
        <div class="who"><span class="av big" style="background:${personColor(m.id)}">${esc(initials(m.name))}</span>
          <div><b>${esc(m.name)}</b>${isMe ? ' <span class="pill" data-s="draft">You</span>' : ''}<div class="muted small">${esc(m.emails[0] ?? 'no email')} · <span class="mono">${esc(m.id)}</span></div></div></div>
        <button class="rolebtn" data-roles="${esc(m.id)}" title="Change roles">${m.roles.map(r => `<span class="pill role">${esc(ROLE_LABEL[r] ?? r)}</span>`).join('') || '<span class="muted">No role</span>'}${icon('chevron', 12)}</button>
        <label class="ptsin"><input type="number" min="0" data-points="${esc(m.id)}" value="${m.points ?? ''}" placeholder="–" aria-label="Points per sprint for ${esc(m.name)}"><span class="muted small">${m.points == null ? 'not counted' : 'points'}</span></label>
        <button class="x" data-remove="${esc(m.id)}" aria-label="Remove ${esc(m.name)}" title="Remove from the project">${icon('x', 15)}</button></div>`;
  }).join('') || '<div class="empty small">No one on the team yet.</div>'}
    </div>
    <div class="card pad"><b>Add a team member</b>
      <div class="addrow">
        <input id="nName" placeholder="Full name" value="${esc(draft.name)}" autocomplete="off">
        <input id="nEmail" placeholder="Email" value="${esc(draft.email)}" autocomplete="off">
        <button class="rolebtn" id="nRoles">${[...draft.roles].map(r => `<span class="pill role">${esc(ROLE_LABEL[r])}</span>`).join('') || 'Roles'}${icon('chevron', 12)}</button>
        <input id="nPoints" type="number" min="0" placeholder="Points" value="${esc(draft.points)}" aria-label="Points per sprint">
        <button class="btn primary" id="nAdd">${icon('plus', 15)} Add member</button>
      </div>
      <div class="muted small">The team's capacity for the next sprint is the sum of everyone's points (${p.team?.capacity ?? 0} now). Product owners usually aren't counted.</div></div>
  </div>`;

  return {
    html,
    bind(el) {
      const reload = () => ctx.reloadTeam(p);
      el.querySelectorAll('[data-roles]').forEach(b => b.onclick = () => {
        const m = team.find(x => x.id === b.dataset.roles);
        const pop = showPop(b, `<div class="menu"><div class="lab">Roles for ${esc(m.name)} (pick any)</div>${ROLES.map(r => `<label class="mrow ${m.roles.includes(r) ? 'on' : ''}"><input type="checkbox" value="${r}" ${m.roles.includes(r) ? 'checked' : ''}><span>${esc(ROLE_LABEL[r])}</span></label>`).join('')}<div class="mfoot"><span class="muted small">Changes save as you tick.</span><button class="link" data-done>Done</button></div></div>`, { width: 260 });
        pop.querySelector('[data-done]').onclick = closePop;
        pop.querySelectorAll('input').forEach(i => i.onchange = async () => {
          const roles = [...pop.querySelectorAll('input:checked')].map(x => x.value);
          if (!roles.length) { i.checked = true; return toast('A person needs at least one role.', 'err'); }
          i.closest('.mrow').classList.toggle('on', i.checked);
          pop.querySelectorAll('input').forEach(x => { x.disabled = true; });
          if ((await ctx.run(p, ['team', 'set', m.id, '--roles', roles.join(',')], { quiet: true })).ok) await reload();
          pop.querySelectorAll('input').forEach(x => { x.disabled = false; });
        });
      });
      el.querySelectorAll('[data-points]').forEach(i => i.onchange = async () => {
        if ((await ctx.run(p, ['team', 'set', i.dataset.points, '--points', i.value === '' ? '0' : String(+i.value)], { quiet: true })).ok) reload();
      });
      el.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
        const m = team.find(x => x.id === b.dataset.remove);
        const n = stories(p, m.id);
        if (!confirm(`Remove ${m.name} from the project?${n ? `\n\n${plural(n, 'open story', 'open stories')} assigned to them will stay assigned until you change them.` : ''}\nNothing is deleted from the git history.`)) return;
        if ((await ctx.run(p, ['team', 'remove', m.id], { quiet: true })).ok) reload();
      });
      const keep = () => { draft.name = el.querySelector('#nName').value; draft.email = el.querySelector('#nEmail').value; draft.points = el.querySelector('#nPoints').value; };
      ['#nName', '#nEmail', '#nPoints'].forEach(s => el.querySelector(s).addEventListener('input', keep));
      el.querySelector('#nRoles').onclick = e => {
        keep();
        const btn = e.currentTarget;
        const pop = showPop(btn, `<div class="menu"><div class="lab">Roles (pick any)</div>${ROLES.map(r => `<label class="mrow ${draft.roles.has(r) ? 'on' : ''}"><input type="checkbox" value="${r}" ${draft.roles.has(r) ? 'checked' : ''}><span>${esc(ROLE_LABEL[r])}</span></label>`).join('')}<div class="mfoot"><span></span><button class="link" data-done>Done</button></div></div>`, { width: 260 });
        pop.querySelector('[data-done]').onclick = closePop;
        pop.querySelectorAll('input').forEach(i => i.onchange = () => {
          draft.roles = new Set([...pop.querySelectorAll('input:checked')].map(x => x.value));
          i.closest('.mrow').classList.toggle('on', i.checked);
          btn.innerHTML = `${[...draft.roles].map(r => `<span class="pill role">${esc(ROLE_LABEL[r])}</span>`).join('') || 'Roles'}${icon('chevron', 12)}`;
        });
      };
      el.querySelector('#nAdd').onclick = async () => {
        keep();
        if (!draft.name.trim()) return ctx.toast('Enter the person\'s name.', 'err');
        if (!draft.roles.size) return ctx.toast('Pick at least one role.', 'err');
        const id = slug(draft.name.split(' ')[0]);
        const args = ['team', 'add', team.some(m => m.id === id) ? slug(draft.name) : id, '--name', draft.name.trim(), '--roles', [...draft.roles].join(',')];
        if (draft.points !== '') args.push('--points', String(+draft.points));
        if (draft.email.trim()) args.push('--emails', draft.email.trim());
        if ((await ctx.run(p, args, { quiet: true })).ok) { p.newMember = null; ctx.toast(`${draft.name.trim()} added to the team.`); reload(); }
      };
    },
  };
}
