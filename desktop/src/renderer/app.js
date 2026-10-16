import { backlogView, boardView, checksView, docsView, epicsView, sprintView } from './views.js';
import { changesView, openPrFor } from './changes.js';
import { planningView } from './plan.js';
import { teamView } from './team.js';
import { prettyModel, usageView } from './usage.js';
import { guideDone, guideSteps, guideView, nextBar, nextStep } from './guide.js';
import { drawerView } from './drawer.js';
import { newWizard, wizardView } from './wizard.js';
import { burndown, currentSprint, epicsOf, fmtDate, sprintsOf, storiesOf } from './data.js';
import { $, ago, closePop, esc, hue, icon, initials, md, navIcon, plural, showPop, toast } from './ui.js';

const api = window.api;

const SKILL_LABELS = {
  'scrumo-kickoff': 'Product strategist · Kickoff',
  'scrumo-prd': 'Business analyst · PRD',
  'scrumo-change': 'BA / architect · Change request',
  'scrumo-architecture': 'Architect · Architecture',
  'scrumo-standards': 'Tech lead · Coding standards',
  'scrumo-epics': 'Product owner · Epics',
  'scrumo-stories': 'Product owner · Stories',
  'scrumo-refine': 'Product owner · Refine backlog',
  'scrumo-sprint': 'Scrum master · Sprint',
  'scrumo-bug': 'QA · Report a bug',
  'scrumo-qa': 'QA · Verify a story',
  'scrumo-dev': 'Developer · Build a story',
  'scrumo-validate': 'Gatekeeper · Validate',
};
const BA_FIRST = ['scrumo-change', 'scrumo-prd', 'scrumo-architecture', 'scrumo-standards', 'scrumo-epics', 'scrumo-stories', 'scrumo-refine', 'scrumo-sprint', 'scrumo-kickoff', 'scrumo-bug', 'scrumo-validate', 'scrumo-qa', 'scrumo-dev'];
const skillRole = s => (SKILL_LABELS[s] ?? 'Agent').split(' · ')[0];

/** Skills as <optgroup>s, one per agent (role), in the order BA_FIRST puts their first skill. */
function skillGroups(skills) {
  const groups = new Map();
  for (const s of skills) {
    const [role, action] = (SKILL_LABELS[s] ?? `Other · ${s}`).split(' · ');
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(`<option value="${esc(s)}">${esc(action ?? s)}</option>`);
  }
  return [...groups].map(([role, opts]) => `<optgroup label="${esc(role)}">${opts.join('')}</optgroup>`).join('');
}

/** Everything the window shows for one project lives in its own entry, so switching projects loses nothing. */
const projects = new Map();
let active = null; // root of the open project, or null for the home screen
let engineInfo = { claudePath: null, version: null };
let autoEdits = false;
let theme = 'system';
let updatesOn = true;
let appVersion = '';
let update = null;
let wizard = null; // the new-project flow, while it is open
let usageData = null;
let modelPref = '';
let modelsList = null;
const P = () => projects.get(active);

/* ---------- documents, checks, team ---------- */
function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith(' ')) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

const typing = () => document.activeElement?.closest?.('#paneView') && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
const dataViews = new Set(['usage', 'guide', 'sprint', 'backlog', 'board', 'epics', 'docs', 'doc', 'team', 'planning', 'checks']);

async function loadDocs(p) {
  const docs = await api.docs(p.info.root);
  p.docs = docs.map(d => ({ ...d, ...parse(d.text) }));
  if (p.info.root !== active) return;
  renderNav();
  if (dataViews.has(p.view) && !typing()) renderView();
}

async function reloadTeam(p) {
  const t = await api.scrumo(p.info.root, ['team', 'list', '--json']);
  p.team = t.json;
  if (wizard?.root === p.info.root) return renderWizard();
  if (p.info.root === active) { renderNav(); if (!typing()) renderView(); }
}

async function refreshChecks(p) {
  if (!p.info.hasCli) return;
  const [v, s, t] = await Promise.all([api.scrumo(p.info.root, ['validate', '--json']), api.scrumo(p.info.root, ['status', '--json']), api.scrumo(p.info.root, ['team', 'list', '--json'])]);
  p.validation = v.json;
  p.status = s.json;
  p.team = t.json;
  if (p.autoView) {
    p.autoView = false;
    if (p.view === 'sprint' && !guideDone(p)) { p.view = 'guide'; if (p.info.root === active) setView('guide'); }
  }
  if (p.info.root !== active) return;
  renderNav();
  if (dataViews.has(p.view) && !typing()) renderView();
}

/** Runs a scrumo command for a project and reports how it went. */
async function run(p, args, { quiet = false } = {}) {
  const r = await api.scrumo(p.info.root, args);
  if (r.code !== 0) {
    toast((r.stderr || r.stdout || 'The scrumo command failed.').trim().split('\n').slice(0, 3).join(' '), 'err');
    return { ok: false, r };
  }
  if (!quiet) toast((r.stdout || 'Done.').trim().split('\n')[0]);
  await Promise.all([loadDocs(p), refreshChecks(p)]);
  api.git.status(p.info.root);
  return { ok: true, r };
}

/* ---------- navigation ---------- */
const VIEW_GROUP = {
  usage: 'Project', guide: 'Project', chat: 'Work with the agent', changes: 'Work with the agent', sprint: 'Plan', planning: 'Plan', backlog: 'Plan', board: 'Plan', epics: 'Plan',
  docs: 'Project', doc: 'Project', checks: 'Project', team: 'Project',
};
const VIEW_NAME = { usage: 'Usage', guide: 'Get started', chat: 'Chat', changes: 'Changes', backlog: 'Backlog', board: 'Board', epics: 'Epics', docs: 'Documents', checks: 'Checks', team: 'Team' };

function crumbs(p) {
  const sp = currentSprint(p);
  const trail = [VIEW_GROUP[p.view]];
  if (p.view === 'sprint') trail.push(`Sprint ${p.sprintShown ?? sp?.number ?? ''}`.trim());
  else if (p.view === 'planning') trail.push('Sprint', `Plan Sprint ${(sprintsOf(p).at(-1)?.number ?? 0) + 1}`);
  else if (p.view === 'doc') trail.push('Documents', p.docs.find(d => d.path === p.selected)?.meta.title ?? p.selected ?? '');
  else trail.push(VIEW_NAME[p.view]);
  return trail.map((t, i) => (i === trail.length - 1 ? `<b>${esc(t)}</b>` : `<span>${esc(t)}</span><i>/</i>`)).join('');
}

function setView(view, { peek = null } = {}) {
  const p = P();
  if (!p) return;
  closePop();
  p.view = view;
  p.peek = peek;
  p.peekTrail = [];
  $('#main').dataset.view = view;
  $('#main').classList.toggle('split', p.split && view !== 'chat');
  renderHeader();
  renderNav();
  renderView();
  renderDrawer();
  if (view === 'usage') refreshUsage();
  if (view === 'chat') { scrollDown(); $('#prompt').focus(); }
}

const ctx = {
  api, toast, run, skillRole,
  go: v => setView(v),
  render: () => (wizard ? renderWizard() : renderView()),
  project: root => projects.get(root),
  adopt: info => { if (!projects.has(info.root)) makeProject(info); },
  closeWizard: (open, kick) => closeWizard(open, kick),
  openExisting: folder => openExistingFolder(folder),
  openDoc(path, { full = false } = {}) {
    if (!full && /\/(stories|epics)\//.test(path)) return ctx.peek(path);
    ctx.openFull(path);
  },
  openFull(path) {
    const p = P();
    if (p.view !== 'doc') { p.backTo = p.view; p.backPeek = p.peek; }
    p.selected = path;
    setView('doc');
  },
  peek(path, { push = false } = {}) {
    const p = P();
    if (push && p.peek) (p.peekTrail ??= []).push(p.peek); else p.peekTrail = [];
    p.peek = path;
    renderDrawer();
  },
  peekBack() { const p = P(); p.peek = p.peekTrail.pop() ?? null; renderDrawer(); },
  projectName: root => projects.get(root)?.info.name ?? root.split('/').pop(),
  modelLabel: () => (modelPref ? (modelsList?.find(m => m.value === modelPref)?.name ?? prettyModel(modelPref)) : ''),
  closePeek() { const p = P(); p.peek = null; p.peekTrail = []; renderDrawer(); },
  chatWith(skill, text) {
    setView('chat');
    if ([...$('#skill').options].some(o => o.value === skill)) $('#skill').value = skill;
    $('#prompt').value = text;
    $('#prompt').focus();
    $('#prompt').setSelectionRange(text.length, text.length);
  },
  refreshChecks, reloadTeam, showIdentity: () => showIdentity(),
  storiesAssignedTo: (p, id) => storiesOf(p).filter(s => s.assignee === id && !['done', 'cancelled'].includes(s.status)).length,
};

function renderNav() {
  const p = P();
  if (!p) return;
  const g = p.git;
  const sp = currentSprint(p);
  const open = storiesOf(p).filter(s => !['done', 'cancelled'].includes(s.status)).length;
  const asks = p.asks.size;
  const changes = g?.files?.length ?? 0;
  const errs = p.validation && !p.validation.ok ? p.validation.findings.length : 0;
  const item = (v, label, badge = '', cls = '') => `<button class="nav-item ${p.view === v || (v === 'docs' && p.view === 'doc') || (v === 'sprint' && p.view === 'planning') ? 'on' : ''} ${cls}" data-go="${v}">${navIcon(v)}${label}${badge}</button>`;
  const sync = p.syncing ? '<span class="spin"></span>Updating…' : g?.syncError ? '<span class="err-text">Sync problem</span>' : g?.remote ? `up to date · ${ago(g.syncedAt)}` : 'local only';
  const pinned = ['docs/prd.md', 'docs/architecture.md', 'docs/brief.md'].map(path => p.docs.find(d => d.path === path)).filter(Boolean);
  $('#sideNav').innerHTML = `
    <div class="sn-head"><b>${esc(p.info.name)}</b>${g?.repo ? `<button class="syncline" id="syncBtn" title="Fetch the latest changes now">${icon('branch', 13)}${esc(g.branch)} · ${sync}</button>` : '<span class="muted small">Not a git repository</span>'}</div>
    <button class="findbox" id="findBtn">${icon('search', 15)}Find a story or document<kbd>⌘K</kbd></button>
    ${p.status ? `<div>${item('guide', guideDone(p) ? 'Workflow' : 'Get started', guideDone(p) ? '' : `<span class="badge">${guideSteps(p).filter(x => x.state === 'done').length}/${guideSteps(p).length}</span>`)}</div>` : ''}
    <div><div class="grp">Work with the agent</div>
      ${item('chat', 'Chat', asks ? `<span class="badge warn">${asks}</span>` : '')}
      ${item('changes', 'Changes', changes ? `<span class="badge">${changes}</span>` : '')}</div>
    <div><div class="grp">Plan</div>
      ${item('sprint', 'Sprint', sp ? `<span class="n">${sp.number}</span>` : '')}
      ${item('backlog', 'Backlog', `<span class="n">${open}</span>`)}
      ${item('board', 'Board')}
      ${item('epics', 'Epics', `<span class="n">${epicsOf(p).length}</span>`)}</div>
    <div><div class="grp">Project</div>
      ${item('docs', 'Documents', `<span class="n">${p.docs.length}</span>`)}
      ${item('checks', 'Checks', errs ? `<span class="badge err">${errs}</span>` : p.validation ? '<span class="badge ok">valid</span>' : '')}
      ${item('usage', 'Usage')}
      ${item('team', 'Team', `<span class="n">${p.team?.team?.length ?? ''}</span>`)}</div>
    ${pinned.length ? `<div><div class="grp">Pinned</div>${pinned.map(d => `<button class="nav-item small" data-doc="${esc(d.path)}">${esc(d.meta.title || d.path)}</button>`).join('')}</div>` : ''}`;
}

function renderHeader() {
  const p = P();
  if (!p) return;
  const g = p.git;
  $('#crumbs').innerHTML = crumbs(p);
  const back = $('#backBtn');
  back.hidden = !(p.view === 'doc' && p.backTo);
  back.innerHTML = icon('chevron', 18, 'style="transform:rotate(90deg)"');
  const split = $('#splitBtn');
  split.hidden = p.view === 'chat';
  split.innerHTML = icon('split', 18);
  split.classList.toggle('on', p.split);
  const chip = $('#engineChip');
  chip.className = `chip static ${engineInfo.claudePath ? '' : 'err'}`;
  chip.innerHTML = engineInfo.claudePath
    ? `<i class="sdot" data-s="done"></i>Claude Code ${esc(String(engineInfo.version ?? '').split(' ')[0])} · connected`
    : '<i class="sdot" data-s="blocked"></i>Claude Code not found';
  const n = g?.files?.length ?? 0;
  $('#saveBtn').hidden = !n;
  $('#saveBtn').textContent = `Save changes · ${n}`;
  const who = p.identity;
  $('#idBtn').innerHTML = `<span class="avatar">${esc(initials(who?.name || who?.gh?.login || '?'))}</span><span>${esc(who?.name || 'Set git identity')}</span>`;
  $('#gearBtn').innerHTML = icon('gear', 18);
}

function renderView() {
  const p = P();
  if (!p || p.view === 'chat') return;
  const el = $('#paneView');
  const keep = el.scrollTop;
  let v;
  switch (p.view) {
    case 'usage': v = usageView(p, ctx, usageData); break;
    case 'guide': v = guideView(p, ctx); break;
    case 'sprint': v = sprintView(p, ctx); break;
    case 'planning': v = planningView(p, ctx); break;
    case 'backlog': v = backlogView(p, ctx); break;
    case 'board': v = boardView(p, ctx); break;
    case 'epics': v = epicsView(p, ctx); break;
    case 'docs': v = docsView(p, ctx); break;
    case 'doc': v = docView(p); break;
    case 'checks': v = checksView(p, ctx); break;
    case 'team': v = teamView(p, ctx); break;
    case 'changes': v = changesView(p, ctx); break;
    default: v = { html: '' };
  }
  el.innerHTML = v.html;
  v.bind?.(el);
  if (['sprint', 'backlog', 'board', 'epics', 'docs'].includes(p.view) && p.status && !guideDone(p)) {
    el.insertAdjacentHTML('afterbegin', nextBar(p));
    el.querySelector('#nextGuide')?.addEventListener('click', () => setView('guide'));
    el.querySelector('#nextGo')?.addEventListener('click', () => {
      const x = nextStep(p);
      if (x.state === 'review' || (!x.skill && !x.go)) return setView('guide');
      x.skill ? ctx.chatWith(x.skill, x.prompt ?? '') : ctx.go(x.go);
    });
  }
  el.scrollTop = p.view === 'doc' ? 0 : keep;
  markSelected();
}

/* ---------- the side drawer for a story or epic ---------- */
function renderDrawer() {
  const p = P();
  const el = $('#drawer');
  if (!p || !p.peek || p.view === 'doc') { el.hidden = true; markSelected(); return; }
  const v = drawerView(p, p.peek, ctx);
  el.hidden = false;
  el.innerHTML = v.html;
  v.bind?.(el);
  el.querySelector('.drawer-body')?.scrollTo(0, 0);
  markSelected();
}

/** Highlights the row (or card) whose details are open in the drawer. */
function markSelected() {
  const p = P();
  document.querySelectorAll('#paneView [data-doc]').forEach(r => r.classList.toggle('sel', !!p?.peek && r.dataset.doc === p.peek));
}

/* ---------- a document, full window ---------- */
function docView(p) {
  const d = p.docs.find(x => x.path === p.selected);
  if (!d) return { html: '<div class="empty"><b>Nothing selected</b>Pick a document from Documents, or search with ⌘K.</div>' };
  const props = ['status', 'version', 'type', 'priority', 'points', 'sprint', 'assignee', 'epic'].filter(k => d.meta[k] && d.meta[k] !== 'null')
    .map(k => `<span>${k} <b>${esc(d.meta[k])}</b></span>`).join('');
  const changed = p.git?.files?.some(f => f.path === d.path);
  const html = `<div class="reader"><article class="doc"><div class="path">${esc(d.path)}${changed ? ' <span class="edited">unsaved changes</span>' : ''}</div>
    <div class="props">${props}<span id="byline" class="byline"></span></div><div class="md">${md(d.body)}</div></article>
    <aside class="outline"><div class="lab">On this page</div></aside></div>`;
  return {
    html,
    bind(el) {
      el.querySelectorAll('.md table').forEach(t => { const w = document.createElement('div'); w.className = 'tbl'; t.replaceWith(w); w.appendChild(t); });
      const heads = [...el.querySelectorAll('.md h2, .md h3')];
      el.querySelector('.outline').insertAdjacentHTML('beforeend', heads.map((h, i) => `<a data-h="${i}">${esc(h.textContent)}</a>`).join(''));
      el.querySelectorAll('.outline a').forEach(a => a.onclick = () => heads[+a.dataset.h].scrollIntoView({ behavior: 'smooth', block: 'start' }));
      const show = log => {
        const b = el.querySelector('#byline');
        if (b && log) b.innerHTML = `last updated by <span class="av" style="background:hsl(${hue(log.email)} 42% 42%)">${esc(initials(log.name))}</span><b>${esc(log.name)}</b> · ${esc(ago(log.at))} <span class="mono faint" title="${esc(log.subject)}">${esc(log.hash)}</span>`;
      };
      p.fileLogs ??= new Map();
      if (p.fileLogs.has(d.path)) show(p.fileLogs.get(d.path));
      else api.git.fileLog(p.info.root, d.path).then(log => { p.fileLogs.set(d.path, log); if (p.view === 'doc') show(log); });
    },
  };
}

/* ---------- model and usage ---------- */
const FALLBACK_MODELS = [{ value: '', name: 'Default' }, { value: 'sonnet', name: 'Sonnet' }, { value: 'opus', name: 'Opus' }, { value: 'haiku', name: 'Haiku' }];
function renderModelPicker() {
  const list = [{ value: '', name: 'Default', description: 'What Claude Code uses unless told otherwise' }, ...(modelsList ?? FALLBACK_MODELS).filter(m => m.value && m.value !== 'default')];
  const sel = $('#modelPick');
  sel.innerHTML = list.map(m => `<option value="${esc(m.value)}" title="${esc(m.description ?? '')}">${esc(m.name)}</option>`).join('');
  if (modelPref && !list.some(m => m.value === modelPref)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(modelPref)}">${esc(prettyModel(modelPref))}</option>`);
  sel.value = modelPref;
}

/** A small ring showing how full the conversation is. */
function renderContext() {
  const p = P();
  const c = p?.context;
  const pct = c ? Math.max(0, Math.min(100, c.percentage)) : 0;
  const R = 8, C = 2 * Math.PI * R;
  const color = pct >= 85 ? 'var(--err)' : pct >= 65 ? 'var(--warn)' : 'var(--accent)';
  const el = $('#ctxRing');
  el.title = c ? `Context: ${Math.round(pct)}% full (${c.totalTokens.toLocaleString()} of ${c.maxTokens.toLocaleString()} tokens)` : 'Context: starts empty. It fills as the conversation grows.';
  el.setAttribute('aria-label', el.title);
  el.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" role="img" aria-hidden="true"><circle cx="11" cy="11" r="${R}" fill="none" stroke="var(--line-strong)" stroke-width="3"/><circle cx="11" cy="11" r="${R}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(C * pct) / 100} ${C}" transform="rotate(-90 11 11)"/></svg>`;
}

/* ---------- the chat's own bar, files it changed, and earlier chats ---------- */
function renderChatBar() {
  const p = P();
  $('#chatTitle').textContent = p?.chatTitle || 'New chat';
}

function renderChatFiles() {
  const p = P();
  const el = $('#chatFiles');
  const list = [...(p?.chatFiles ?? new Map())];
  if (!list.length) { el.hidden = true; return; }
  const named = path => { const d = p.docs.find(x => x.path === path); return { id: d?.meta.id ?? '', title: d?.meta.title || path.split('/').pop() }; };
  const unsaved = p.git?.files?.length ?? 0;
  el.hidden = false;
  el.innerHTML = `<div class="cf-head"><b>Changed in this chat</b><span class="badge">${list.length}</span></div>
    <div class="cf-list">${list.map(([path, f]) => { const n = named(path); return `<button class="cfile" data-path="${esc(path)}" title="${esc(path)}"><span class="kind" data-k="${f.kind === 'created' ? 'new' : 'modified'}">${f.kind === 'created' ? 'New' : 'Edited'}</span><span class="cf-main"><span class="cf-title">${esc(n.title)}</span><span class="mono small muted">${esc(n.id || path.replace(/^docs\//, ''))}</span></span></button>`; }).join('')}</div>
    <div class="cf-foot">${unsaved ? `<button class="btn small primary" id="cfSave">Save changes · ${unsaved}</button>` : '<span class="muted small">Everything is saved.</span>'}</div>`;
  el.querySelectorAll('.cfile').forEach(b => b.onclick = () => ctx.openDoc(b.dataset.path));
  el.querySelector('#cfSave')?.addEventListener('click', () => setView('changes'));
}

/** Plays an earlier chat's messages into the thread, without touching the project. */
function replay(p, m) {
  const root = p.info.root;
  if (m.type === 'assistant') return onMessage({ root, msg: m });
  if (m.type !== 'user') return;
  const c = m.message?.content;
  const parts = typeof c === 'string' ? [{ type: 'text', text: c }] : (c ?? []);
  for (const b of parts) {
    if (b.type === 'tool_result') onMessage({ root, msg: { type: 'user', message: { content: [b] } } });
    else if (b.type === 'text' && b.text.trim() && !/^<(system-reminder|local-command)/.test(b.text.trim())) {
      const cmd = b.text.match(/<command-name>\/?([^<]+)<\/command-name>/);
      const args = b.text.match(/<command-args>([\s\S]*?)<\/command-args>/);
      const text = cmd ? (args?.[1] ?? '').trim() : b.text.trim();
      if (text || cmd) append(p, `<div class="msg-user">${cmd ? `<span class="mono small">/${esc(cmd[1])}</span> ` : ''}${esc(text)}</div>`);
    }
  }
}

async function openHistory(p, chat) {
  const msgs = await api.openChat(p.info.root, chat.id);
  p.tools.clear(); p.asks.clear(); p.edited.clear(); p.chatFiles = new Map(); p.context = null;
  emptyThread(p);
  p.replaying = true;
  for (const m of msgs) replay(p, m);
  p.replaying = false;
  p.chatTitle = chat.title;
  setBusy(p, false);
  append(p, `<div class="info">Earlier chat · ${esc(ago(chat.at))}. Your next message continues it.</div>`);
  renderChatBar(); renderChatFiles(); renderContext();
  scrollDown();
}

async function showHistory() {
  const p = P();
  const list = await api.chats(p.info.root);
  const pop = showPop($('#histBtn'), `<div class="menu"><div class="lab">Earlier chats in ${esc(p.info.name)}</div>${list.length ? list.map(c => `<button class="mrow histrow" data-id="${esc(c.id)}"><span class="histtitle">${esc(c.title.replace(/^\/\S+\s*/, '').slice(0, 90) || c.title)}</span><em>${esc(ago(c.at))}</em></button>`).join('') : '<div class="muted small" style="padding:8px 10px">No earlier chats yet.</div>'}</div>`, { width: 380, align: 'right' });
  pop.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { closePop(); openHistory(p, list.find(c => c.id === b.dataset.id)); });
}

async function refreshUsage() {
  usageData = await api.usage();
  if (usageData.models?.length) { modelsList = usageData.models; renderModelPicker(); }
  if (P()?.view === 'usage' && !typing()) renderView();
}

/* ---------- app updates ---------- */
function showUpdateIcon() {
  const b = $('#updateBtn');
  b.hidden = !update;
  if (!update) return;
  b.innerHTML = `${icon('update', 22)}<span class="att" data-a="approved"></span>`;
  b.title = `Update available: ${update.version}`;
  b.setAttribute('aria-label', b.title);
}

function showUpdate() {
  const cmd = 'npm install -g scrumo-desktop@latest';
  const pop = showPop($('#updateBtn'), `<div class="pop-body">
    <h3>Update available</h3>
    <p class="small">Scrumo <b>${esc(update.version)}</b> is out. You have ${esc(appVersion)}.</p>
    ${update.canInstall ? '<p class="muted small">Updating runs <span class="mono">npm install -g scrumo-desktop@latest</span>. Your projects and settings stay as they are.</p>'
      : `<p class="muted small">This copy wasn't installed with npm, so update it from a terminal:</p><div class="diff"><div>${esc(cmd)}</div></div>`}
    <div class="row" id="updRow">${update.canInstall ? '<button class="btn primary small" id="updGo">Update now</button>' : `<button class="btn small" id="updCopy">Copy command</button>`}<button class="btn small ghost" id="updNotes">What's new</button></div>
    <p class="muted small" id="updMsg"></p></div>`, { align: 'left' });
  pop.querySelector('#updNotes').onclick = () => api.openUrl('https://www.npmjs.com/package/scrumo-desktop');
  pop.querySelector('#updCopy')?.addEventListener('click', () => { navigator.clipboard?.writeText(cmd); toast('Command copied.'); });
  pop.querySelector('#updGo')?.addEventListener('click', async e => {
    e.target.disabled = true;
    pop.querySelector('#updMsg').innerHTML = '<span class="spin"></span> Updating…';
    const r = await api.installUpdate();
    if (r.error) { e.target.disabled = false; pop.querySelector('#updMsg').textContent = r.error; return; }
    pop.querySelector('#updRow').innerHTML = '<button class="btn primary small" id="updRestart">Restart now</button>';
    pop.querySelector('#updMsg').textContent = `Updated to ${update.version}. Restart to use it. Any chat in progress will stop.`;
    pop.querySelector('#updRestart').onclick = () => api.restart();
  });
}

/* ---------- git identity, settings ---------- */
async function loadIdentity(p) {
  p.identity = await api.git.identity(p.info.root);
  if (p.info.root === active) renderHeader();
}

async function showIdentity() {
  const p = P();
  await loadIdentity(p);
  const who = p.identity;
  const pop = showPop($('#idBtn'), `<div class="pop-body">
    <h3>Git identity for ${esc(p.info.name)}</h3>
    <p class="muted small">Commits and pull requests from this project are made as this person. It is saved to this project only (<span class="mono">git config --local</span>).</p>
    <label>Name<input id="idName" value="${esc(who.name)}" autocomplete="off"></label>
    <label>Email<input id="idEmail" value="${esc(who.email)}" autocomplete="off"></label>
    <p class="muted small">${who.source === 'this project' ? 'Set for this project.' : who.source === 'global git config' ? 'Using your global git settings until you save one for this project.' : 'Not set yet. Commits need a name and email.'}</p>
    ${who.gh ? `<p class="small">Signed in to GitHub as <b>@${esc(who.gh.login)}</b> <button class="link" id="useGh">Use this account</button></p>`
      : '<p class="muted small">Not signed in to GitHub (<span class="mono">gh auth login</span>), so pull requests can’t be opened.</p>'}
    <div class="row"><span class="grow"></span><button class="btn primary small" id="idSave">Save for this project</button></div>
  </div>`, { align: 'right' });
  pop.querySelector('#useGh')?.addEventListener('click', () => { pop.querySelector('#idName').value = who.gh.name; pop.querySelector('#idEmail').value = who.gh.email; });
  pop.querySelector('#idSave').onclick = async () => {
    const r = await api.git.setIdentity(p.info.root, { name: pop.querySelector('#idName').value, email: pop.querySelector('#idEmail').value });
    if (r.error) return toast(r.error, 'err');
    closePop();
    toast('Saved to this project’s git config.');
    loadIdentity(p);
  };
}

function showSettings() {
  const p = P();
  const pop = showPop($('#gearBtn'), `<div class="pop-body">
    <h3>Settings</h3>
    <label class="check"><input type="checkbox" id="autoEdits" ${autoEdits ? 'checked' : ''}> Approve edits to documents automatically</label>
    <p class="muted small">Edits outside docs/ are always refused, and other commands still ask.</p>
    <label class="check"><input type="checkbox" id="updatesOn" ${updatesOn ? 'checked' : ''}> Check for app updates</label>
    <label>Appearance<select id="themePick"><option value="system">Match my system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <hr>
    <p class="small"><b>Scrumo</b> <span class="muted">${esc(appVersion)}</span></p>
    <p class="small"><b>Claude Code</b><br><span class="muted">${engineInfo.claudePath ? `${esc(engineInfo.version ?? '')} · ${esc(engineInfo.claudePath)}` : 'Not found. Install it and sign in, then restart.'}</span></p>
    <p class="small"><b>This project</b><br><span class="muted mono">${esc(p.info.root)}</span></p>
    <div class="row"><button class="btn small danger" id="removeProj">Remove from list</button></div>
  </div>`, { align: 'right' });
  pop.querySelector('#updatesOn').onchange = e => { updatesOn = e.target.checked; api.setUpdates(updatesOn); if (!updatesOn) { update = null; showUpdateIcon(); } };
  pop.querySelector('#themePick').value = theme;
  pop.querySelector('#themePick').onchange = e => { theme = e.target.value; api.setTheme(theme); };
  pop.querySelector('#autoEdits').onchange = e => { autoEdits = e.target.checked; api.setAutoEdits(autoEdits); };
  pop.querySelector('#removeProj').onclick = () => { closePop(); removeProject(p.info.root); };
}

/* ---------- chat ---------- */
function append(p, html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const node = wrap.firstElementChild;
  p.thread.querySelector('.empty')?.remove();
  p.thread.appendChild(node);
  if (p.info.root === active && p.view === 'chat') scrollDown();
  return node;
}
const scrollDown = () => { const t = $('#thread'); t.scrollTop = t.scrollHeight; };
const emptyThread = p => {
  p.thread.innerHTML = `<div class="empty"><b>Ask for what you need</b>The agent runs your own Claude Code with the project's scrumo skills.
    It can read the project, change documents under docs/ with your approval, and run scrumo checks.</div>`;
};
function setBusy(p, busy) {
  p.busy = busy;
  if (p.info.root === active) {
    $('#stopBtn').hidden = !busy;
    $('#chatState').textContent = busy ? 'Working…' : '';
  }
  renderRail();
}
const relPath = (p, f) => String(f ?? '').startsWith(p.info.root + '/') ? String(f).slice(p.info.root.length + 1) : String(f ?? '');

function toolSummary(p, name, input) {
  switch (name) {
    case 'Bash': return input.description ? `${input.description} — ${input.command}` : input.command;
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': return relPath(p, input.file_path);
    case 'Glob': case 'Grep': return input.pattern;
    case 'Skill': return input.skill + (input.args ? ' ' + input.args : '');
    case 'TodoWrite': return `${(input.todos ?? []).length} steps`;
    default: return JSON.stringify(input).slice(0, 160);
  }
}
const resultText = c => Array.isArray(c) ? c.map(x => x.type === 'text' ? x.text : `[${x.type}]`).join('\n') : String(c ?? '');

function onMessage({ root, msg }) {
  const p = projects.get(root);
  if (!p) return;
  if (msg.type === 'system' && msg.subtype === 'init') {
    const skills = msg.slash_commands.filter(c => c.startsWith('scrumo-')).length;
    append(p, `<div class="info">Session started · ${skills} scrumo skills loaded · ${esc(msg.model)}</div>`);
  } else if (msg.type === 'assistant') {
    for (const b of msg.message.content) {
      if (b.type === 'text' && b.text.trim()) append(p, `<div class="msg-text">${md(b.text)}</div>`);
      if (b.type === 'tool_use' && b.name !== 'AskUserQuestion') {
        const rel0 = ['Edit', 'Write', 'MultiEdit'].includes(b.name) ? relPath(p, b.input.file_path) : null;
        const node = append(p, `<details class="tool"><summary><span class="name">${esc(b.name)}</span><span class="what">${esc(toolSummary(p, b.name, b.input))}</span><span class="res"><span class="spin"></span></span></summary></details>`);
        p.tools.set(b.id, { node, name: b.name, input: b.input, existed: rel0 ? p.docs.some(d => d.path === rel0) : true });
      }
    }
  } else if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
    for (const b of msg.message.content) {
      if (b.type !== 'tool_result') continue;
      const t = p.tools.get(b.tool_use_id);
      if (!t) continue;
      const text = resultText(b.content);
      t.node.querySelector('.res').outerHTML = `<span class="res ${b.is_error ? 'err' : 'ok'}">${b.is_error ? 'failed' : 'done'}</span>`;
      if (text.trim()) t.node.insertAdjacentHTML('beforeend', `<pre>${esc(text.length > 4000 ? text.slice(0, 4000) + '\n…' : text)}</pre>`);
      if (!b.is_error && ['Edit', 'Write', 'MultiEdit'].includes(t.name)) {
        const f = relPath(p, t.input.file_path);
        p.edited.add(f);
        p.selected = f;
        ((p.chatFiles ??= new Map()).get(f)?.kind === 'created' ? null : p.chatFiles.set(f, { kind: t.name === 'Write' && !t.existed ? 'created' : 'updated' }));
        t.node.querySelector('.what').insertAdjacentHTML('afterend', `<button class="link view-doc" data-doc="${esc(f)}">View</button>`);
        if (!p.replaying) { loadDocs(p); api.git.status(p.info.root); renderChatFiles(); }
      }
    }
  } else if (msg.type === 'result') {
    setBusy(p, false);
    append(p, `<div class="result">${msg.subtype === 'success' ? 'Done' : esc(msg.subtype)} · ${(msg.duration_ms / 1000).toFixed(1)}s · ${msg.num_turns} turns</div>`);
    loadDocs(p);
    refreshChecks(p);
    api.git.status(p.info.root);
  } else if (msg.type === 'app_error') {
    setBusy(p, false);
    append(p, `<div class="info err">${esc(msg.message)}</div>`);
  }
}

function diffHtml(oldText, newText) {
  const lines = (s, cls) => String(s ?? '').split('\n').map(l => `<div class="${cls}">${esc(l) || ' '}</div>`).join('');
  return `<div class="diff">${oldText ? lines(oldText, 'del') : ''}${lines(newText, 'add')}</div>`;
}

/** Multiple-choice questions from the agent, as option cards. Answers go back as { question: answer }. */
function questionCard(p, req) {
  const { id, input } = req;
  const qs = (input.questions ?? []).slice(0, 4);
  const state = qs.map(() => ({ picked: new Set(), other: '', otherOn: false }));
  const node = append(p, `<div class="qcard"><div class="qhead">${icon('chat', 15)}<b>The agent has ${qs.length === 1 ? 'a question' : `${qs.length} questions`}</b></div>
    ${qs.map((q, qi) => `<div class="qq" data-q="${qi}"><div class="row"><span class="pill role">${esc(q.header ?? '')}</span>${q.multiSelect ? '<span class="muted small">Pick any that apply</span>' : ''}</div>
      <div class="qtext">${esc(q.question)}</div>
      <div class="qopts">${(q.options ?? []).map((o, oi) => `<button class="qopt" data-o="${oi}" role="${q.multiSelect ? 'checkbox' : 'radio'}" aria-checked="false"><span class="qmark ${q.multiSelect ? 'sq' : ''}"></span><span class="qbody"><b>${esc(o.label)}</b>${o.description ? `<span class="muted small">${esc(o.description)}</span>` : ''}${o.preview ? `<pre class="qprev">${esc(o.preview)}</pre>` : ''}</span><kbd>${oi + 1}</kbd></button>`).join('')}
        <div class="qopt other" data-other><span class="qmark ${q.multiSelect ? 'sq' : ''}"></span><span class="qbody"><b>Something else</b><input class="qother" placeholder="Type your own answer" aria-label="Your own answer"></span></div></div></div>`).join('')}
    <div class="row"><button class="btn ghost" data-skip>Skip</button><span class="grow"></span><span class="muted small" data-hint></span><button class="btn primary" data-send disabled>Send answers</button></div></div>`);
  p.asks.set(id, node);
  const answered = i => state[i].picked.size || (state[i].otherOn && state[i].other.trim());
  const refresh = () => {
    node.querySelector('[data-send]').disabled = !qs.every((_, i) => answered(i));
    node.querySelectorAll('.qq').forEach(sec => {
      const st = state[+sec.dataset.q];
      sec.querySelectorAll('.qopt[data-o]').forEach(b => { const on = st.picked.has(+b.dataset.o); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      sec.querySelector('.qopt.other').classList.toggle('on', st.otherOn);
    });
  };
  node.querySelectorAll('.qq').forEach(sec => {
    const qi = +sec.dataset.q;
    const multi = !!qs[qi].multiSelect;
    sec.querySelectorAll('.qopt[data-o]').forEach(b => b.onclick = () => {
      const st = state[qi], o = +b.dataset.o;
      if (multi) st.picked.has(o) ? st.picked.delete(o) : st.picked.add(o);
      else { st.picked = new Set([o]); st.otherOn = false; }
      refresh();
    });
    const other = sec.querySelector('.qopt.other');
    other.onclick = e => { if (e.target.tagName === 'INPUT') return; const st = state[qi]; st.otherOn = !st.otherOn; if (st.otherOn && !multi) st.picked.clear(); refresh(); if (st.otherOn) other.querySelector('input').focus(); };
    other.querySelector('input').addEventListener('input', e => { const st = state[qi]; st.other = e.target.value; st.otherOn = true; if (!multi) st.picked.clear(); refresh(); });
  });
  const finish = async (allow, text) => {
    p.asks.delete(id);
    renderRail();
    if (p.info.root === active) renderNav();
    const answers = {};
    if (allow) qs.forEach((q, i) => { const st = state[i]; const parts = [...st.picked].sort().map(o => q.options[o].label); if (st.otherOn && st.other.trim()) parts.push(st.other.trim()); answers[q.question] = parts.join(', '); });
    node.classList.add('done');
    node.innerHTML = allow ? `<div class="qhead">${icon('check', 15)}<b>You answered</b></div>${qs.map(q => `<div class="qsum"><span class="muted small">${esc(q.header ?? '')}</span><div>${esc(answers[q.question])}</div></div>`).join('')}` : `<div class="qhead muted">Skipped the agent's question${qs.length > 1 ? 's' : ''}.</div>`;
    await api.answer({ id, allow, message: allow ? undefined : text, answers: allow ? answers : undefined });
  };
  node.querySelector('[data-send]').onclick = () => finish(true);
  node.querySelector('[data-skip]').onclick = () => finish(false, 'The person chose not to answer. Continue with your best judgement and say what you assumed.');
  node.addEventListener('keydown', e => { // 1 to 4 picks an option in the first unanswered question
    if (e.target.tagName === 'INPUT' || !/^[1-4]$/.test(e.key)) return;
    const qi = state.findIndex((_, i) => !answered(i));
    node.querySelector(`.qq[data-q="${qi < 0 ? 0 : qi}"] .qopt[data-o="${+e.key - 1}"]`)?.click();
  });
  node.tabIndex = -1;
  renderRail();
  if (p.info.root === active) { renderNav(); if (p.view !== 'chat' && !p.split) setView('chat'); }
  node.focus();
}

function onAsk(req) {
  const p = projects.get(req.root);
  if (!p) return;
  if (req.toolName === 'AskUserQuestion') return questionCard(p, req);
  const { id, toolName, input } = req;
  const file = input.file_path ? relPath(p, input.file_path) : '';
  let title = `Allow ${esc(toolName)}?`;
  let body = '';
  if (toolName === 'Edit') { title = `Change <span class="mono">${esc(file)}</span>?`; body = diffHtml(input.old_string, input.new_string); }
  else if (toolName === 'MultiEdit') { title = `Change <span class="mono">${esc(file)}</span>?`; body = (input.edits ?? []).map(e => diffHtml(e.old_string, e.new_string)).join(''); }
  else if (toolName === 'Write') { title = `Write <span class="mono">${esc(file)}</span>?`; body = diffHtml('', String(input.content ?? '').split('\n').slice(0, 60).join('\n')); }
  else if (toolName === 'Bash') { title = 'Run a command?'; body = `<div class="diff"><div>${esc(input.command)}</div></div>`; }
  else body = `<div class="diff"><div>${esc(JSON.stringify(input, null, 2))}</div></div>`;
  const node = append(p, `<div class="ask"><header>${title}</header>${body}<div class="row"><button class="btn primary" data-allow>Allow this change</button><button class="btn danger" data-deny>Deny</button></div></div>`);
  p.asks.set(id, node);
  const answer = async allow => {
    node.classList.add('done');
    node.querySelector('.row').innerHTML = `<span class="muted small">${allow ? 'Allowed' : 'Denied'}</span>`;
    p.asks.delete(id);
    renderRail();
    if (p.info.root === active) renderNav();
    await api.answer({ id, allow });
  };
  node.querySelector('[data-allow]').onclick = () => answer(true);
  node.querySelector('[data-deny]').onclick = () => answer(false);
  if (file && toolName !== 'Bash') p.selected = file;
  renderRail();
  if (p.info.root === active) { renderNav(); if (p.view !== 'chat' && !p.split) setView('chat'); } // an approval blocks the agent, so bring it forward
}

async function send() {
  const p = P();
  const ta = $('#prompt');
  const text = ta.value.trim();
  if (!text || p.busy) return;
  const skill = $('#skill').value;
  if (!p.chatTitle) { p.chatTitle = text.slice(0, 70); renderChatBar(); }
  append(p, `<div class="msg-user">${skill ? `<span class="mono small">/${esc(skill)}</span> ` : ''}${esc(text)}</div>`);
  ta.value = '';
  setBusy(p, true);
  const r = await api.send(p.info.root, skill ? `/${skill} ${text}` : text);
  if (r?.error) { setBusy(p, false); append(p, `<div class="info err">${esc(r.error)}</div>`); }
}

/* ---------- command palette ---------- */
function openPalette() {
  const p = P();
  if (!p) return;
  const wrap = $('#palette');
  const input = $('#paletteInput');
  const items = [
    ...storiesOf(p).map(s => ({ label: s.title, id: s.id, path: s.path, status: s.status })),
    ...epicsOf(p).map(e => ({ label: e.title, id: e.id, path: e.path, status: e.status })),
    ...p.docs.filter(d => !d.path.includes('/stories/') && !d.path.includes('/epics/')).map(d => ({ label: d.meta.title || d.path, id: '', path: d.path, status: d.meta.status })),
  ];
  let sel = 0;
  let list = [];
  const draw = () => {
    const q = input.value.toLowerCase();
    list = items.filter(i => !q || `${i.id} ${i.label}`.toLowerCase().includes(q)).slice(0, 30);
    sel = Math.min(sel, Math.max(0, list.length - 1));
    $('#paletteList').innerHTML = list.map((i, n) => `<button class="${n === sel ? 'on' : ''}" data-i="${n}"><span class="mono small muted" style="width:56px">${esc(i.id)}</span><span style="flex:1">${esc(i.label)}</span>${i.status ? `<span class="pill" data-s="${esc(i.status)}">${esc(i.status)}</span>` : ''}</button>`).join('') || '<div class="empty small">Nothing found.</div>';
  };
  const pick = n => { if (!list[n]) return; wrap.hidden = true; ctx.openDoc(list[n].path); };
  wrap.hidden = false;
  input.value = '';
  draw();
  input.focus();
  input.oninput = () => { sel = 0; draw(); };
  input.onkeydown = e => {
    if (e.key === 'Escape') wrap.hidden = true;
    else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, list.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') pick(sel);
  };
  $('#paletteList').onclick = e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); };
  wrap.onmousedown = e => { if (e.target === wrap) wrap.hidden = true; };
}

/* ---------- projects: rail, home, switching ---------- */
const attention = p => {
  if (p.asks.size) return 'ask';
  if (p.busy) return 'working';
  const prs = p.git?.prs ?? [];
  if (prs.some(x => x.status === 'changes')) return 'changes';
  if (prs.some(x => x.status === 'approved')) return 'approved';
  if (p.git?.files?.length) return 'unsaved';
  return '';
};

function renderRail() {
  $('#homeBtn').classList.toggle('active', active === null);
  $('#homeBtn').innerHTML = icon('home', 20);
  $('#addBtn').innerHTML = icon('plus', 18);
  $('#railProjects').innerHTML = [...projects.values()].map(p => {
    const a = attention(p);
    return `<button class="tile project-tile ${p.info.root === active ? 'active' : ''}" data-root="${esc(p.info.root)}" style="--h:${hue(p.info.root)}" title="${esc(p.info.name)}${p.git?.branch ? ` · ${esc(p.git.branch)}` : ''}${a === 'working' ? ' · the agent is working' : ''}" aria-label="${esc(p.info.name)}">
      ${esc(initials(p.info.name))}${a ? `<span class="att" data-a="${a}"></span>` : ''}</button>`;
  }).join('');
}

const PR_LABEL = { review: 'Waiting for review', approved: 'Approved · ready to merge', changes: 'Changes requested' };

function homeAttention() {
  const items = [];
  for (const p of projects.values()) {
    const name = p.info.name;
    if (p.asks.size) items.push({ root: p.info.root, view: 'chat', tone: 'in-progress', title: `${plural(p.asks.size, 'approval')} waiting`, sub: `${name} · the agent is waiting for you` });
    for (const pr of p.git?.prs ?? []) {
      if (pr.status === 'changes') items.push({ root: p.info.root, view: 'changes', tone: 'blocked', title: `Changes requested on #${pr.number}`, sub: `${name} · ${pr.title}` });
      if (pr.status === 'approved') items.push({ root: p.info.root, view: 'changes', tone: 'done', title: `#${pr.number} approved, ready to merge`, sub: `${name} · ${pr.title}` });
    }
    const n = p.git?.files?.length ?? 0;
    if (n) items.push({ root: p.info.root, view: 'changes', tone: 'in-progress', title: `${plural(n, 'change')} not saved yet`, sub: `${name} · ${p.git.files.slice(0, 2).map(f => f.path.replace(/^docs\//, '')).join(', ')}` });
    for (const a of (p.status?.attention ?? []).slice(0, 2)) items.push({ root: p.info.root, view: 'sprint', tone: 'blocked', title: a, sub: name });
  }
  $('#homeAttention').innerHTML = `<h3>Needs your attention<span class="badge">${items.length}</span></h3>${items.map(i => `<button class="att-item" data-root="${esc(i.root)}" data-view="${i.view}"><i class="sdot" data-s="${i.tone}"></i><div><b>${esc(i.title)}</b><div class="muted small">${esc(i.sub)}</div></div></button>`).join('') || '<div class="empty small">Nothing needs you right now.</div>'}`;
}

function renderHome() {
  const list = [...projects.values()];
  $('#homeSub').textContent = list.length ? 'Pick up where you left off, or start a new project.' : 'Start a new project, or open a folder that already has a scrumo.yaml.';
  $('#cards').innerHTML = list.map(p => {
    const g = p.git;
    const sp = currentSprint(p);
    const pr = (g?.prs ?? []).find(x => ['changes', 'approved', 'review'].includes(x.status));
    const done = sp ? storiesOf(p).filter(s => s.sprint === sp.number && s.status === 'done').reduce((n, s) => n + (s.points ?? 0), 0) : 0;
    return `<div class="card" data-root="${esc(p.info.root)}" tabindex="0" role="button">
      <div class="card-top"><span class="tile static" style="--h:${hue(p.info.root)}">${esc(initials(p.info.name))}</span>
        <div class="card-title"><b>${esc(p.info.name)}</b><span class="muted small">${esc(p.info.key)}${sp ? ` · Sprint ${sp.number} ${sp.status}` : ''}</span></div>
        <button class="icon-btn x" data-remove="${esc(p.info.root)}" title="Remove from list" aria-label="Remove ${esc(p.info.name)} from list">${icon('x', 15)}</button></div>
      <div class="mono small muted path-line" title="${esc(p.info.root)}">${esc(p.info.root.replace(/^\/Users\/[^/]+/, '~'))}</div>
      <div class="row wrap">${g?.repo ? `<span class="pill branch">${esc(g.branch)}</span>` : ''}${g?.files?.length ? `<span class="pill" data-s="in-progress">${plural(g.files.length, 'unsaved change')}</span>` : ''}${pr ? `<span class="pill" data-pr="${pr.status}">PR #${pr.number}: ${PR_LABEL[pr.status]}</span>` : ''}</div>
      ${sp && sp.points ? `<div class="bar"><i style="width:${Math.round((100 * done) / sp.points)}%"></i></div><div class="muted small">${done} of ${sp.points} points done</div>` : ''}</div>`;
  }).join('') + `<button class="card add-card" id="newCard"><span class="plus">+</span>New project…</button><button class="card add-card" id="addCard"><span class="plus">${icon('home', 22)}</span>Open existing…</button>`;
  homeAttention();
}

/* ---------- new project ---------- */
function openWizard() {
  closePop();
  leave();
  active = null;
  wizard = newWizard();
  $('#home').hidden = true;
  $('#project').hidden = true;
  $('#wizard').hidden = false;
  renderRail();
  renderWizard();
}

function renderWizard() {
  if (!wizard) return;
  const v = wizardView(wizard, ctx);
  $('#wizardBody').innerHTML = v.html;
  v.bind(document.querySelector('#wizardBody'));
}

function closeWizard(open, kick) {
  const root = wizard?.root;
  wizard = null;
  $('#wizard').hidden = true;
  if (open && root) {
    activate(root, kick ? 'chat' : 'guide');
    if (kick) { ctx.chatWith(kick.skill, kick.text); send(); }
  } else if (root) activate(root, 'guide');
  else show(null);
}

async function openExistingFolder(folder) {
  const r = await api.addProject(folder);
  if (r.project) { if (!projects.has(r.project.root)) makeProject(r.project); wizard = null; activate(r.project.root, 'sprint'); }
}

function newOrOpenMenu(anchor) {
  const pop = showPop(anchor, `<div class="menu"><button class="mrow" data-new><span>New project…</span></button><button class="mrow" data-open><span>Open an existing project…</span></button></div>`, { width: 230 });
  pop.querySelector('[data-new]').onclick = openWizard;
  pop.querySelector('[data-open]').onclick = () => { closePop(); addProject(); };
}

function makeProject(info) {
  const thread = document.createElement('div');
  thread.className = 'thread-inner';
  const p = {
    info, docs: [], selected: 'docs/prd.md', status: null, validation: null, team: null, view: info.hasCli ? 'sprint' : 'chat', autoView: info.hasCli, split: false,
    edited: new Set(), busy: false, tools: new Map(), asks: new Map(), thread, git: info.git, identity: null, syncing: false,
  };
  emptyThread(p);
  projects.set(info.root, p);
  loadDocs(p);
  refreshChecks(p);
  api.git.sync(info.root);
  loadIdentity(p);
  return p;
}

function show(root, view) {
  closePop();
  active = root;
  wizard = null;
  $('#wizard').hidden = true;
  $('#home').hidden = root !== null;
  $('#project').hidden = root === null;
  if (root === null) { renderHome(); renderRail(); return; }
  const p = P();
  const skills = (p.info.skills ?? []).slice().sort((a, b) => BA_FIRST.indexOf(a) - BA_FIRST.indexOf(b));
  $('#skill').innerHTML = `<option value="">No skill: just ask</option>` + skillGroups(skills);
  $('#skill').value = p.skill ?? '';
  $('#thread').replaceChildren(p.thread);
  $('#prompt').value = p.draft ?? '';
  $('#stopBtn').innerHTML = icon('stop', 14);
  $('#stopBtn').hidden = !p.busy;
  $('#chatState').textContent = p.busy ? 'Working…' : '';
  renderModelPicker();
  renderContext();
  renderChatBar();
  renderChatFiles();
  renderRail();
  setView(view ?? p.view);
  api.git.sync(root);
}

function leave() { // keeps what was typed in the composer for next time
  const p = P();
  if (p) { p.draft = $('#prompt').value; p.skill = $('#skill').value; }
}
function activate(root, view) { leave(); show(root, view); }

async function removeProject(root) {
  const p = projects.get(root);
  if (!p || !confirm(`Remove ${p.info.name} from the list? Its files stay where they are.`)) return;
  await api.removeProject(root);
  projects.delete(root);
  if (active === root) show(null); else { renderHome(); renderRail(); }
}

async function addProject() {
  const r = await api.addProject();
  if (r.error) return toast(r.error, 'err');
  if (!r.project) return;
  if (!projects.has(r.project.root)) makeProject(r.project);
  activate(r.project.root, 'sprint');
}

/* ---------- wiring ---------- */
$('#sendBtn').onclick = send;
$('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('#stopBtn').onclick = () => api.interrupt(active);
$('#newChat').onclick = async () => { const p = P(); await api.reset(active); p.tools.clear(); p.asks.clear(); p.edited.clear(); p.chatFiles = new Map(); p.chatTitle = ''; p.context = null; p.lastUsage = null; setBusy(p, false); emptyThread(p); renderContext(); renderChatBar(); renderChatFiles(); renderNav(); };
$('#histBtn').onclick = showHistory;
$('#homeBtn').onclick = () => { wizard = null; $('#wizard').hidden = true; activate(null); };
$('#addBtn').onclick = e => newOrOpenMenu(e.currentTarget);
$('#updateBtn').onclick = showUpdate;
$('#railProjects').onclick = e => { const b = e.target.closest('[data-root]'); if (b) activate(b.dataset.root); };
$('#railProjects').addEventListener('contextmenu', e => { const b = e.target.closest('[data-root]'); if (b) { e.preventDefault(); removeProject(b.dataset.root); } });
$('#cards').onclick = e => {
  if (e.target.closest('#newCard')) return openWizard();
  if (e.target.closest('#addCard')) return addProject();
  const x = e.target.closest('[data-remove]');
  if (x) return removeProject(x.dataset.remove);
  const c = e.target.closest('.card[data-root]');
  if (c) activate(c.dataset.root, 'sprint');
};
$('#cards').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('.card[data-root]')?.click(); });
$('#homeAttention').onclick = e => { const b = e.target.closest('[data-root]'); if (b) activate(b.dataset.root, b.dataset.view); };
$('#sideNav').onclick = e => {
  const go = e.target.closest('[data-go]');
  if (go) return setView(go.dataset.go);
  const doc = e.target.closest('[data-doc]');
  if (doc) return ctx.openDoc(doc.dataset.doc, { full: true });
  if (e.target.closest('#findBtn')) return openPalette();
  if (e.target.closest('#syncBtn')) { const p = P(); p.syncing = true; renderNav(); api.git.sync(p.info.root); }
};
$('#thread').onclick = e => { const b = e.target.closest('.view-doc'); if (b) ctx.openDoc(b.dataset.doc, { full: true }); };
$('#backBtn').onclick = () => { const p = P(); const to = p.backTo; const peek = p.backPeek; p.backTo = null; p.backPeek = null; if (to) setView(to, { peek }); };
$('#splitBtn').onclick = () => { const p = P(); p.split = !p.split; $('#main').classList.toggle('split', p.split && p.view !== 'chat'); renderHeader(); };
$('#saveBtn').onclick = () => setView('changes');
$('#idBtn').onclick = showIdentity;
$('#gearBtn').onclick = showSettings;
document.addEventListener('mousedown', e => { if (!e.target.closest('#pop, #idBtn, #gearBtn, .fchip, .rolebtn, .tile, #updateBtn, #nRoles')) closePop(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#pop').hidden) closePop(); else if (!$('#drawer').hidden) ctx.closePeek(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && active) { e.preventDefault(); openPalette(); }
});

api.on('create:progress', ({ id, state, msg }) => { if (wizard) { wizard.steps[id] = { state, msg }; renderWizard(); } });
api.on('usage:update', ({ root, total }) => { const p = projects.get(root); if (p) p.lastUsage = { total }; refreshUsage(); });
api.on('usage:context', ({ root, ...c }) => { const p = projects.get(root); if (p) { p.context = c; if (root === active) renderContext(); } });
api.on('usage:limits', () => refreshUsage());
api.on('models:list', list => { modelsList = list; renderModelPicker(); });
$('#modelPick').onchange = async e => { modelPref = e.target.value; await api.setModel(modelPref); toast(`Next message uses ${modelPref ? ctx.modelLabel() : 'the default model'}.`); };
api.on('chat:message', onMessage);
api.on('chat:ask', onAsk);
api.on('chat:ask-cancel', id => {
  for (const p of projects.values()) {
    const n = p.asks.get(id);
    if (n) { n.classList.add('done'); n.querySelector('.row').innerHTML = '<span class="muted small">Cancelled</span>'; p.asks.delete(id); }
  }
  renderRail();
  if (P()) renderNav();
});
api.on('docs:changed', root => { const p = projects.get(root); if (p) { loadDocs(p); refreshChecks(p); api.git.status(root); } });
api.on('project:added', info => { if (!projects.has(info.root)) makeProject(info); activate(info.root); });
api.on('project:focus', root => { if (projects.has(root)) activate(root, 'changes'); });
api.on('update:available', u => { if (!updatesOn) return; update = u; showUpdateIcon(); });
api.on('app:focus', () => { if (active) api.git.sync(active); });
api.on('git:state', ({ root, git }) => {
  const p = projects.get(root);
  if (!p) return;
  const fresh = (git.notes ?? []).filter(n => !(p.git?.notes ?? []).includes(n));
  p.git = git;
  p.syncing = false;
  fresh.forEach(n => toast(n));
  renderRail();
  if (active === null) { renderHome(); return; }
  if (root !== active) return;
  renderHeader();
  renderNav();
  if (p.view === 'chat') renderChatFiles();
  if (['changes', 'doc'].includes(p.view) && !typing() && !document.activeElement?.closest('.save-box')) renderView();
});
setInterval(() => { if (active && P()?.git) renderNav(); }, 30000);

const init = await api.init();
engineInfo = init.engine;
theme = init.theme ?? 'system';
modelPref = init.model ?? '';
modelsList = init.models ?? null;
updatesOn = init.updates !== false;
appVersion = init.version ?? '';
update = init.update ?? null;
showUpdateIcon();
init.projects.forEach(makeProject);
renderRail();
show(init.open && projects.has(init.open) ? init.open : null, init.open ? 'sprint' : undefined);
