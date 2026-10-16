// Usage: what the agent has used, by model and project, plus the plan limits Claude reports.
import { esc, plural } from './ui.js';

export const prettyModel = id => {
  const m = String(id).replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '');
  const parts = m.split('-');
  const name = parts.filter(x => !/^\d+$/.test(x)).map(x => x[0].toUpperCase() + x.slice(1)).join(' ');
  const ver = parts.filter(x => /^\d+$/.test(x)).join('.');
  return `${name || m}${ver ? ' ' + ver : ''}`.trim();
};
const fmt = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const money = n => `$${(n ?? 0).toFixed(n >= 10 ? 2 : 3)}`;
const PERIODS = [['today', 'Today', 1], ['week', 'Last 7 days', 7], ['month', 'Last 30 days', 30], ['all', 'All time', 9999]];
const LIMITS = { five_hour: '5-hour window', seven_day: 'Weekly', seven_day_opus: 'Weekly (Opus)', seven_day_sonnet: 'Weekly (Sonnet)', overage: 'Extra usage' };

/** Adds up the ledger for the last `days` days: per model, per project, and overall. */
function totals(ledger, days, nameOf) {
  const out = { models: {}, projects: {}, all: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } };
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
  for (const [day, byProject] of Object.entries(ledger?.days ?? {})) {
    if (new Date(`${day}T00:00:00`) < since) continue;
    for (const [root, d] of Object.entries(byProject)) {
      const proj = (out.projects[root] ??= { name: nameOf(root), input: 0, output: 0, cost: 0, turns: 0 });
      proj.turns += d.turns; out.all.turns += d.turns;
      for (const [model, u] of Object.entries(d.models ?? {})) {
        const m = (out.models[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
        for (const k of Object.keys(m)) { m[k] += u[k] ?? 0; if (k in out.all) out.all[k] += u[k] ?? 0; }
        proj.input += u.input ?? 0; proj.output += u.output ?? 0; proj.cost += u.cost ?? 0;
      }
    }
  }
  return out;
}

const limitBar = (key, l) => {
  const raw = l.utilization;
  const pct = raw == null ? null : Math.round(raw <= 1 ? raw * 100 : raw);
  const reset = l.resetsAt ? new Date(l.resetsAt * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const tone = l.status === 'rejected' ? 'blocked' : l.status === 'allowed_warning' || (pct ?? 0) >= 80 ? 'in-progress' : 'done';
  return `<div class="limit"><div class="row between"><b>${esc(LIMITS[key] ?? key)}</b><span class="pill" data-s="${tone}">${l.status === 'rejected' ? 'Limit reached' : pct == null ? (l.status === 'allowed_warning' ? 'Getting close' : 'OK') : `${pct}% used`}</span></div>
    ${pct == null ? '' : `<div class="bar"><i style="width:${Math.min(100, pct)}%;background:var(--${tone === 'done' ? 'accent' : tone === 'blocked' ? 'err' : 'warn'})"></i></div>`}
    ${reset ? `<div class="muted small">Resets ${esc(reset)}</div>` : ''}</div>`;
};

export function usageView(p, ctx, data) {
  const period = ctx.usagePeriod ?? 'week';
  const [, , days] = PERIODS.find(x => x[0] === period) ?? PERIODS[1];
  if (!data) return { html: '<div class="page"><div class="empty">Loading usage…</div></div>' };
  const nameOf = root => ctx.projectName(root);
  const t = totals(data, days, nameOf);
  const rows = Object.entries(t.models).sort((a, b) => b[1].cost - a[1].cost);
  const projs = Object.values(t.projects).sort((a, b) => b.cost - a.cost);
  const limits = Object.entries(data.limits ?? {}).filter(([, l]) => Date.now() - (l.at ?? 0) < 7 * 864e5);
  const c = p.context;
  const last = p.lastUsage;

  const html = `<div class="page usage">
    <div class="page-head"><div><div class="title-row"><h1>Usage</h1></div>
      <div class="muted">What the agent has used through this app. Figures are estimates at API prices: on a Claude subscription you aren't billed per token, but usage counts against your plan limits.</div></div></div>

    <div class="two even">
      <div class="card pad"><span class="lab">Your plan</span>
        ${limits.length ? limits.map(([k, l]) => limitBar(k, l)).join('') : '<div class="muted small">Plan limits appear here once Claude reports them, after your first message in this app. They only exist for Claude subscriptions (not API keys or cloud providers).</div>'}</div>
      <div class="card pad"><span class="lab">This chat</span>
        <div class="kv"><span class="muted">Model</span><b>${esc(c?.model ? prettyModel(c.model) : (ctx.modelLabel() || 'Default'))}</b></div>
        <div class="kv"><span class="muted">Context used</span><b>${c ? `${Math.round(c.percentage)}% · ${fmt(c.totalTokens)} of ${fmt(c.maxTokens)} tokens` : 'Starts with your first message'}</b></div>
        ${c ? `<div class="bar"><i style="width:${Math.min(100, c.percentage)}%;background:var(--${c.percentage >= 85 ? 'err' : c.percentage >= 65 ? 'warn' : 'accent'})"></i></div>` : ''}
        <div class="kv"><span class="muted">Cost so far</span><b>${last ? money(last.total) : '$0.000'} <span class="muted small">API-equivalent</span></b></div>
        ${c?.percentage >= 75 ? '<div class="note warn">The conversation is getting long. Start a new chat for unrelated work to keep answers sharp and cheaper.</div>' : ''}</div>
    </div>

    <div class="card pad">
      <div class="row between"><b>Totals</b><div class="seg" role="tablist">${PERIODS.map(([k, label]) => `<button role="tab" data-period="${k}" aria-selected="${k === period}">${label}</button>`).join('')}</div></div>
      <div class="kpis small4">
        <div class="kpi mini"><span class="lab">Messages</span><b>${t.all.turns}</b></div>
        <div class="kpi mini"><span class="lab">Tokens in</span><b>${fmt(t.all.input + t.all.cacheRead + t.all.cacheWrite)}</b><span class="muted small">${fmt(t.all.cacheRead)} from cache</span></div>
        <div class="kpi mini"><span class="lab">Tokens out</span><b>${fmt(t.all.output)}</b></div>
        <div class="kpi mini"><span class="lab">API-equivalent</span><b>${money(t.all.cost)}</b></div></div>
      ${rows.length ? `<table class="utable"><thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cost</th></tr></thead><tbody>${rows.map(([m, u]) => `<tr><td><b>${esc(prettyModel(m))}</b></td><td>${fmt(u.input + u.cacheWrite)}</td><td>${fmt(u.output)}</td><td>${fmt(u.cacheRead)}</td><td>${money(u.cost)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty small">No usage recorded in this period yet.</div>'}
    </div>

    ${projs.length ? `<div class="card pad"><b>By project</b><table class="utable"><thead><tr><th>Project</th><th>Messages</th><th>Tokens (in + out)</th><th>Cost</th></tr></thead><tbody>${projs.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.turns}</td><td>${fmt(x.input + x.output)}</td><td>${money(x.cost)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="muted small">Usage is counted from when this version of the app started recording. ${plural(Object.keys(data.days ?? {}).length, 'day')} on record.</div></div>`;
  return {
    html,
    bind(el) { el.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { ctx.usagePeriod = b.dataset.period; ctx.render(); }); },
  };
}
