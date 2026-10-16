// New project: choose a folder, set it up, add the team, start the kickoff conversation.
import { teamView } from './team.js';
import { esc, icon } from './ui.js';

const STEPS = [['git', 'Track changes with git'], ['package', 'Prepare the folder'], ['cli', 'Install the scrumo CLI'], ['init', 'Set up scrumo'], ['me', 'Add you to the team'], ['commit', 'Save the first commit']];
const titleCase = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
export const suggestKey = name => {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const k = (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? '').slice(0, 3)).toUpperCase().replace(/^[0-9]+/, '').slice(0, 5);
  return k.length >= 2 ? k : (k + 'XX').slice(0, 2);
};
export const newWizard = () => ({ stage: 1, folder: null, info: null, name: '', key: '', keyTouched: false, git: true, running: false, steps: {}, error: null, root: null, brief: '' });

const stepper = stage => `<div class="journey wsteps">${[['Folder'], ['Team'], ['Kickoff']].map(([label], i) => {
  const state = i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : '';
  return `<div class="step ${state}"><i>${state === 'done' ? icon('check', 11) : i + 1}</i>${label}</div>`;
}).join('')}</div>`;

export function wizardView(w, ctx) {
  const head = `<div class="wizard-head"><h1>New project</h1><button class="btn ghost" id="wCancel">${w.root ? 'Close' : 'Cancel'}</button></div>${stepper(w.stage)}`;
  let body = '';
  if (w.stage === 1) {
    const keyOk = /^[A-Z][A-Z0-9]{1,9}$/.test(w.key);
    const ready = w.folder && !w.info?.isProject && w.name.trim() && keyOk && !w.running;
    body = `<div class="card pad wbody">
      <div><div class="lab">Project folder</div>
        <div class="folderrow"><div class="folder ${w.folder ? '' : 'empty'}">${w.folder ? `<span class="mono">${esc(w.folder.replace(/^\/Users\/[^/]+/, '~'))}</span>` : 'No folder chosen'}</div>
        <button class="btn" id="wPick" ${w.running ? 'disabled' : ''}>${w.folder ? 'Change…' : 'Choose or create a folder…'}</button></div>
        ${w.info?.isProject ? '<div class="note warn">This folder is already a scrumo project. <button class="link" id="wOpenExisting">Open it instead</button></div>'
          : w.folder && w.info?.hasFiles ? '<div class="note">This folder already has files. scrumo only adds <span class="mono">docs/</span>, <span class="mono">scrumo.yaml</span> and its agent skills; your other files aren\'t touched.</div>' : ''}
      </div>
      <div class="fields"><label>Project name<input id="wName" value="${esc(w.name)}" placeholder="PawPlan" autocomplete="off" ${w.running ? 'disabled' : ''}></label>
        <label>Ticket key<input id="wKey" value="${esc(w.key)}" placeholder="PAW" maxlength="10" autocomplete="off" ${w.running ? 'disabled' : ''}><span class="muted small ${w.key && !keyOk ? 'err-text' : ''}">${w.key && !keyOk ? '2 to 10 capital letters or digits, starting with a letter' : `Stories will be numbered ${esc(w.key || 'KEY')}-1, ${esc(w.key || 'KEY')}-2…`}</span></label></div>
      ${w.info?.isRepo ? '' : `<label class="check"><input type="checkbox" id="wGit" ${w.git ? 'checked' : ''} ${w.running ? 'disabled' : ''}> Track changes with git <span class="muted small">(recommended: it's how your team reviews changes)</span></label>`}
      ${Object.keys(w.steps).length ? `<div class="progress">${STEPS.filter(([id]) => w.steps[id]).map(([id, label]) => {
    const st = w.steps[id];
    return `<div class="prog ${st.state}"><span class="pi">${st.state === 'done' ? icon('check', 13) : st.state === 'err' ? icon('x', 13) : st.state === 'run' ? '<span class="spin"></span>' : '–'}</span><span>${label}</span>${st.msg ? `<span class="muted small">${esc(st.msg)}</span>` : ''}</div>`;
  }).join('')}</div>` : ''}
      ${w.error ? `<div class="note bad">${esc(w.error)}</div>` : ''}
      <div class="row"><span class="muted small">${w.running ? 'This takes about half a minute.' : 'Needs Node.js and git on this computer.'}</span><span class="grow"></span>
        <button class="btn primary big-btn" id="wCreate" ${ready ? '' : 'disabled'}>${w.running ? 'Setting up…' : w.error ? 'Try again' : 'Set up project'}</button></div></div>`;
  } else if (w.stage === 2) {
    const p = ctx.project(w.root);
    const t = p ? teamView(p, ctx, { bare: true }) : { html: '' };
    body = `<div class="muted wintro">Add the people who will work on <b>${esc(w.name)}</b>. Roles decide who is suggested for each skill, and points per sprint set the team's capacity for sprint planning. You can change this any time from the Team page.</div>
      ${t.html}
      <div class="row"><button class="btn ghost big-btn" id="wSkipTeam">Skip for now</button><span class="grow"></span><button class="btn primary big-btn" id="wToKickoff">Continue to kickoff</button></div>`;
  } else {
    body = `<div class="card pad wbody"><div><b>Start with a kickoff</b>
      <div class="muted">The product strategist asks a few questions and writes the project brief (<span class="mono">docs/brief.md</span>), which everything else builds on. Describe the product in a few sentences to begin.</div></div>
      <textarea id="wBrief" rows="5" placeholder="For example: PawPlan is a booking app for a single vet clinic. Pet owners book and cancel appointments online, and the front desk sets each vet's hours.">${esc(w.brief)}</textarea>
      <div class="row"><button class="btn ghost big-btn" id="wSkipKick">Skip, open the project</button><span class="grow"></span><button class="btn primary big-btn" id="wKick" ${w.brief.trim() ? '' : 'disabled'}><span class="slash">/</span> Start kickoff <span class="tag">Product strategist</span></button></div></div>`;
  }

  return {
    html: `<div class="wizard">${head}${body}</div>`,
    bind(el) {
      const again = () => ctx.render();
      el.querySelector('#wCancel').onclick = () => ctx.closeWizard(false);
      if (w.stage === 1) {
        el.querySelector('#wPick')?.addEventListener('click', async () => {
          const r = await ctx.api.pickFolder();
          if (r.cancelled) return;
          Object.assign(w, { folder: r.folder, info: r, error: null, steps: {}, git: !r.isRepo });
          if (!w.name) w.name = titleCase(r.name);
          if (!w.keyTouched) w.key = suggestKey(w.name);
          again();
        });
        el.querySelector('#wOpenExisting')?.addEventListener('click', () => ctx.openExisting(w.folder));
        el.querySelector('#wName')?.addEventListener('input', e => {
          w.name = e.target.value;
          if (!w.keyTouched) { w.key = suggestKey(w.name); el.querySelector('#wKey').value = w.key; }
          check(el, w);
        });
        el.querySelector('#wKey')?.addEventListener('input', e => { w.key = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); w.keyTouched = true; e.target.value = w.key; check(el, w); });
        el.querySelector('#wGit')?.addEventListener('change', e => { w.git = e.target.checked; });
        el.querySelector('#wCreate')?.addEventListener('click', async () => {
          Object.assign(w, { running: true, error: null, steps: {} });
          again();
          const r = await ctx.api.createProject({ folder: w.folder, name: w.name.trim(), key: w.key, git: w.git });
          w.running = false;
          if (r.error) { w.error = r.error; return again(); }
          w.root = r.project.root;
          ctx.adopt(r.project);
          w.stage = 2;
          again();
        });
      } else if (w.stage === 2) {
        const p = ctx.project(w.root);
        if (p) teamView(p, ctx, { bare: true }).bind?.(el);
        el.querySelector('#wSkipTeam').onclick = () => { w.stage = 3; again(); };
        el.querySelector('#wToKickoff').onclick = () => { w.stage = 3; again(); };
      } else {
        el.querySelector('#wBrief').addEventListener('input', e => { w.brief = e.target.value; el.querySelector('#wKick').disabled = !w.brief.trim(); });
        el.querySelector('#wSkipKick').onclick = () => ctx.closeWizard(true);
        el.querySelector('#wKick').onclick = () => ctx.closeWizard(true, { skill: 'scrumo-kickoff', text: w.brief.trim() });
      }
    },
  };
}

/** Enables the button without redrawing, so typing keeps its place. */
function check(el, w) {
  const ok = w.folder && !w.info?.isProject && w.name.trim() && /^[A-Z][A-Z0-9]{1,9}$/.test(w.key);
  const b = el.querySelector('#wCreate');
  if (b) b.disabled = !ok;
}
