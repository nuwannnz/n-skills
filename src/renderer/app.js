const api = window.api;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = text => { try { return window.marked.parse(text, { gfm: true }); } catch { return `<pre>${esc(text)}</pre>`; } };

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

const state = {
  project: null, docs: [], selected: null, status: null, validation: null, tab: 'doc',
  edited: new Set(), busy: false, tools: new Map(), asks: new Map(),
};

/* ---------- documents ---------- */
function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith(' ')) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}
const num = p => +((p.match(/-(\d+)-/) || [])[1] || 0);

async function loadDocs() {
  const docs = await api.docs();
  state.docs = docs.map(d => ({ ...d, ...parse(d.text) }));
  renderSidebar();
  if (state.tab === 'doc') renderInspector();
}

async function refreshChecks() {
  if (!state.project?.hasCli) return;
  setHealth('run', 'Checking…');
  const [v, s] = await Promise.all([api.scrumo(['validate', '--json']), api.scrumo(['status', '--json'])]);
  state.validation = v.json;
  state.status = s.json;
  if (!v.json) setHealth('err', 'Validator failed');
  else if (v.json.ok) setHealth('ok', `Valid · ${v.json.files} files`);
  else setHealth('err', `${v.json.errors} error${v.json.errors === 1 ? '' : 's'}${v.json.warnings ? `, ${v.json.warnings} warning${v.json.warnings === 1 ? '' : 's'}` : ''}`);
  $('#checksCount').textContent = v.json && !v.json.ok ? String(v.json.findings.length) : '';
  renderSidebar();
  if (state.tab === 'checks') renderInspector();
}
function setHealth(kind, text) { $('#healthDot').className = 'dot ' + kind; $('#healthText').textContent = text; }

function renderSidebar() {
  const sb = $('#sidebar');
  if (!state.project) { sb.innerHTML = '<div class="empty"><b>No project open</b>Open a folder that has a scrumo.yaml.</div>'; return; }
  const item = d => {
    const id = d.meta.id ? `<span class="id">${esc(d.meta.id)}</span>` : '';
    const title = d.meta.title || d.path.replace('docs/', '');
    return `<button class="sb-item ${state.selected === d.path ? 'active' : ''}" data-doc="${esc(d.path)}" title="${esc(title)} (${esc(d.meta.status)})">
      <span class="sdot" data-s="${esc(d.meta.status)}"></span>${id}<span class="t">${esc(title)}</span>${state.edited.has(d.path) ? '<span class="edited">edited</span>' : ''}</button>`;
  };
  const ORDER = ['docs/brief.md', 'docs/prd.md', 'docs/architecture.md', 'docs/coding-standards.md', 'docs/sprint-tracker.md'];
  const rank = p => (ORDER.indexOf(p) + 1) || 99;
  const planning = state.docs.filter(d => !d.path.includes('/epics/') && !d.path.includes('/stories/')).sort((a, b) => rank(a.path) - rank(b.path));
  const epics = state.docs.filter(d => d.path.includes('/epics/')).sort((a, b) => num(a.path) - num(b.path));
  const stories = state.docs.filter(d => d.path.includes('/stories/')).sort((a, b) => num(a.path) - num(b.path));
  const active = state.status?.sprints?.find(s => s.status === 'active');
  const sprint = active ? `<div class="sprint">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>Sprint ${active.number}</b>${active.pace ? `<span class="pill" data-s="${esc(active.pace.verdict)}">${esc(active.pace.verdict)}</span>` : ''}</div>
      <p>${esc(active.goal)}</p>
      <div class="bar"><i style="width:${active.points ? Math.round(100 * active.donePoints / active.points) : 0}%"></i></div>
      <p>${active.donePoints} of ${active.points} points done</p>
      ${(state.status.attention ?? []).length ? `<ul class="attn">${state.status.attention.slice(0, 4).map(a => `<li>${esc(typeof a === 'string' ? a : a.message ?? a.text ?? JSON.stringify(a))}</li>`).join('')}</ul>` : ''}
    </div>` : '';
  sb.innerHTML = `${sprint}
    <div class="sb-group"><div class="sb-label"><span>Planning</span></div>${planning.map(item).join('')}</div>
    <div class="sb-group"><div class="sb-label"><span>Epics</span><span>${epics.length}</span></div>${epics.map(item).join('')}</div>
    <div class="sb-group"><div class="sb-label"><span>Stories &amp; bugs</span><span>${stories.length}</span></div>${stories.map(item).join('')}</div>`;
}

function renderInspector() {
  document.querySelectorAll('.insp-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  const el = $('#inspector');
  if (state.tab === 'checks') {
    const v = state.validation;
    if (!v) { el.innerHTML = '<div class="empty">Not checked yet.</div>'; return; }
    el.innerHTML = v.findings.length
      ? v.findings.map(f => `<div class="finding ${esc(f.severity)}"><div class="code">${esc(f.code)} · ${esc(f.severity)}</div><div>${esc(f.message)}</div><div class="file">${esc(f.file)}${f.line ? ':' + f.line : ''}</div></div>`).join('')
      : `<div class="empty"><b>No problems</b>scrumo validate checked ${v.files} files.</div>`;
    return;
  }
  const d = state.docs.find(x => x.path === state.selected);
  if (!d) { el.innerHTML = '<div class="empty"><b>Nothing selected</b>Pick a document on the left. Documents the agent edits open here.</div>'; return; }
  const props = ['status', 'version', 'type', 'priority', 'points', 'sprint', 'assignee', 'epic', 'updated']
    .filter(k => d.meta[k] && d.meta[k] !== 'null').map(k => `<span>${k} <b>${esc(d.meta[k])}</b></span>`).join('');
  el.innerHTML = `<div class="path">${esc(d.path)}</div><div class="props">${props}</div><div class="md">${md(d.body)}</div>`;
  el.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'tbl'; t.replaceWith(w); w.appendChild(t); });
}

/* ---------- chat ---------- */
const thread = () => $('#threadInner');
function append(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const node = wrap.firstElementChild;
  $('#threadInner .empty')?.remove();
  thread().appendChild(node);
  const t = $('#thread');
  t.scrollTop = t.scrollHeight;
  return node;
}
function emptyThread() {
  thread().innerHTML = `<div class="empty"><b>Ask for what you need</b>The agent runs your own Claude Code with the project's scrumo skills.
    It can read the project, change documents under docs/ with your approval, and run scrumo checks.</div>`;
}
function setBusy(busy) {
  state.busy = busy;
  $('#stopBtn').hidden = !busy;
  $('#chatState').textContent = busy ? 'Working…' : '';
}
const rel = p => state.project && String(p ?? '').startsWith(state.project.root + '/') ? String(p).slice(state.project.root.length + 1) : String(p ?? '');

function toolSummary(name, input) {
  switch (name) {
    case 'Bash': return input.description ? `${input.description} — ${input.command}` : input.command;
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': return rel(input.file_path);
    case 'Glob': case 'Grep': return input.pattern;
    case 'Skill': return input.skill + (input.args ? ' ' + input.args : '');
    case 'TodoWrite': return `${(input.todos ?? []).length} steps`;
    default: return JSON.stringify(input).slice(0, 160);
  }
}
const resultText = c => Array.isArray(c) ? c.map(x => x.type === 'text' ? x.text : `[${x.type}]`).join('\n') : String(c ?? '');

function onMessage(msg) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    const login = msg.apiKeySource === 'none' ? 'your Claude login' : msg.apiKeySource;
    const badge = $('#engineBadge');
    badge.textContent = `Claude Code ${msg.claude_code_version} · ${msg.model} · ${login}`;
    badge.className = 'engine ok';
    const skills = msg.slash_commands.filter(c => c.startsWith('scrumo-')).length;
    append(`<div class="info">Session started · ${skills} scrumo skills loaded · permission mode ${esc(msg.permissionMode)}</div>`);
  } else if (msg.type === 'assistant') {
    for (const b of msg.message.content) {
      if (b.type === 'text' && b.text.trim()) append(`<div class="msg-text">${md(b.text)}</div>`);
      if (b.type === 'tool_use') {
        const node = append(`<details class="tool"><summary><span class="name">${esc(b.name)}</span><span class="what">${esc(toolSummary(b.name, b.input))}</span><span class="res"><span class="spin"></span></span></summary></details>`);
        state.tools.set(b.id, { node, name: b.name, input: b.input });
      }
    }
  } else if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
    for (const b of msg.message.content) {
      if (b.type !== 'tool_result') continue;
      const t = state.tools.get(b.tool_use_id);
      if (!t) continue;
      const text = resultText(b.content);
      t.node.querySelector('.res').outerHTML = `<span class="res ${b.is_error ? 'err' : 'ok'}">${b.is_error ? 'failed' : 'done'}</span>`;
      if (text.trim()) t.node.insertAdjacentHTML('beforeend', `<pre>${esc(text.length > 4000 ? text.slice(0, 4000) + '\n…' : text)}</pre>`);
      if (!b.is_error && ['Edit', 'Write', 'MultiEdit'].includes(t.name)) {
        const p = rel(t.input.file_path);
        state.edited.add(p);
        state.selected = p;
        state.tab = 'doc';
        loadDocs();
      }
    }
  } else if (msg.type === 'result') {
    setBusy(false);
    const secs = (msg.duration_ms / 1000).toFixed(1);
    append(`<div class="result">${msg.subtype === 'success' ? 'Done' : esc(msg.subtype)} · ${secs}s · ${msg.num_turns} turns · API-equivalent cost $${(msg.total_cost_usd ?? 0).toFixed(3)}</div>`);
    loadDocs();
    refreshChecks();
  } else if (msg.type === 'app_error') {
    setBusy(false);
    append(`<div class="info err">${esc(msg.message)}</div>`);
  }
}

function diffHtml(oldText, newText) {
  const lines = (s, cls) => String(s ?? '').split('\n').map(l => `<div class="${cls}">${esc(l) || ' '}</div>`).join('');
  return `<div class="diff">${lines(oldText, 'del')}${lines(newText, 'add')}</div>`;
}
function onAsk(req) {
  const { id, toolName, input } = req;
  let title = `Allow ${esc(toolName)}?`;
  let body = '';
  if (toolName === 'Edit') { title = `Change <span class="mono">${esc(rel(input.file_path))}</span>?`; body = diffHtml(input.old_string, input.new_string); }
  else if (toolName === 'MultiEdit') { title = `Change <span class="mono">${esc(rel(input.file_path))}</span>?`; body = (input.edits ?? []).map(e => diffHtml(e.old_string, e.new_string)).join(''); }
  else if (toolName === 'Write') { title = `Write <span class="mono">${esc(rel(input.file_path))}</span>?`; body = diffHtml('', String(input.content ?? '').split('\n').slice(0, 60).join('\n')); }
  else if (toolName === 'Bash') { title = 'Run a command?'; body = `<div class="diff"><div>${esc(input.command)}</div></div>`; }
  else body = `<div class="diff"><div>${esc(JSON.stringify(input, null, 2))}</div></div>`;
  const node = append(`<div class="ask"><header>${title}</header>${body}<div class="row"><button class="btn primary" data-allow>Allow</button><button class="btn danger" data-deny>Deny</button></div></div>`);
  state.asks.set(id, node);
  const answer = async allow => {
    node.classList.add('done');
    node.querySelector('.row').innerHTML = `<span class="muted small">${allow ? 'Allowed' : 'Denied'}</span>`;
    state.asks.delete(id);
    await api.answer({ id, allow });
  };
  node.querySelector('[data-allow]').onclick = () => answer(true);
  node.querySelector('[data-deny]').onclick = () => answer(false);
  if (toolName !== 'Bash' && input.file_path) { state.selected = rel(input.file_path); state.tab = 'doc'; renderSidebar(); renderInspector(); }
}

async function send() {
  const ta = $('#prompt');
  const text = ta.value.trim();
  if (!text || state.busy) return;
  const skill = $('#skill').value;
  const full = skill ? `/${skill} ${text}` : text;
  append(`<div class="msg-user">${skill ? `<span class="mono small">/${esc(skill)}</span> ` : ''}${esc(text)}</div>`);
  ta.value = '';
  setBusy(true);
  const r = await api.send(full);
  if (r?.error) { setBusy(false); append(`<div class="info err">${esc(r.error)}</div>`); }
}

/* ---------- wiring ---------- */
function applyProject(p) {
  state.project = p;
  state.selected = 'docs/prd.md';
  state.edited.clear();
  $('#tbProject').innerHTML = p ? `${esc(p.name)} <span>· ${esc(p.key)} · ${esc(p.root)}</span>` : 'No project';
  const skills = (p?.skills ?? []).slice().sort((a, b) => BA_FIRST.indexOf(a) - BA_FIRST.indexOf(b));
  $('#skill').innerHTML = `<option value="">No skill: just ask</option>` + skills.map(s => `<option value="${esc(s)}">${esc(SKILL_LABELS[s] ?? s)}</option>`).join('');
  if (p && !p.hasCli) setHealth('err', 'scrumo CLI not installed in this project');
  emptyThread();
  loadDocs();
  refreshChecks();
}

$('#sendBtn').onclick = send;
$('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('#stopBtn').onclick = () => api.interrupt();
$('#newChat').onclick = async () => { await api.reset(); state.tools.clear(); setBusy(false); emptyThread(); };
$('#autoEdits').onchange = e => api.setAutoEdits(e.target.checked);
$('#healthBtn').onclick = () => { state.tab = 'checks'; renderInspector(); refreshChecks(); };
$('#openProject').onclick = async () => {
  const r = await api.pickProject();
  if (r.error) alert(r.error);
  else if (r.project) applyProject(r.project);
};
document.querySelector('.insp-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { state.tab = b.dataset.tab; renderInspector(); } };
$('#sidebar').onclick = e => { const b = e.target.closest('[data-doc]'); if (b) { state.selected = b.dataset.doc; state.tab = 'doc'; renderSidebar(); renderInspector(); } };

api.on('chat:message', onMessage);
api.on('chat:ask', onAsk);
api.on('chat:ask-cancel', id => { const n = state.asks.get(id); if (n) { n.classList.add('done'); n.querySelector('.row').innerHTML = '<span class="muted small">Cancelled</span>'; } });
api.on('docs:changed', () => loadDocs());

const init = await api.init();
const badge = $('#engineBadge');
if (init.engine.claudePath) badge.textContent = `${init.engine.version ?? 'Claude Code'} · login used on first message`;
else { badge.textContent = 'Claude Code not found'; badge.className = 'engine err'; }
applyProject(init.project);
