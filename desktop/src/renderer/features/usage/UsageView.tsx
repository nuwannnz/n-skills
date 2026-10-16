// Usage: what the agent has used, by model and project, plus the plan limits Claude reports.
import { setApp, useApp, useChat } from '../../app/store';
import { plural, prettyModel } from '../../lib/format';
import type { Usage } from '../../lib/types';
import { Card, Empty, Note, PageHead, Pill, ProgressBar, Segmented } from '../../ui';
import { modelLabel } from '../chat/Composer';
import { projectName } from '../projects/actions';

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const money = (n: number | undefined) => `$${(n ?? 0).toFixed((n ?? 0) >= 10 ? 2 : 3)}`;
const PERIODS: [string, string, number][] = [['today', 'Today', 1], ['week', 'Last 7 days', 7], ['month', 'Last 30 days', 30], ['all', 'All time', 9999]];
const LIMITS: Record<string, string> = { five_hour: '5-hour window', seven_day: 'Weekly', seven_day_opus: 'Weekly (Opus)', seven_day_sonnet: 'Weekly (Sonnet)', overage: 'Extra usage' };
type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
const zero = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });

/** Adds up the ledger for the last `days` days: per model, per project, and overall. */
function totals(ledger: Usage, days: number) {
  const out = { models: {} as Record<string, Tokens>, projects: {} as Record<string, { name: string; input: number; output: number; cost: number; turns: number }>, all: { ...zero(), turns: 0 } };
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
  for (const [day, byProject] of Object.entries(ledger.days ?? {})) {
    if (new Date(`${day}T00:00:00`) < since) continue;
    for (const [root, d] of Object.entries(byProject)) {
      const proj = (out.projects[root] ??= { name: projectName(root), input: 0, output: 0, cost: 0, turns: 0 });
      proj.turns += d.turns; out.all.turns += d.turns;
      for (const [model, u] of Object.entries(d.models ?? {})) {
        const m = (out.models[model] ??= zero());
        for (const k of Object.keys(m) as (keyof Tokens)[]) { m[k] += u[k] ?? 0; out.all[k] += u[k] ?? 0; }
        proj.input += u.input ?? 0; proj.output += u.output ?? 0; proj.cost += u.cost ?? 0;
      }
    }
  }
  return out;
}

function LimitBar({ name, l }: { name: string; l: NonNullable<Usage['limits']>[string] }) {
  const raw = l.utilization;
  const pct = raw == null ? null : Math.round(raw <= 1 ? raw * 100 : raw);
  const reset = l.resetsAt ? new Date(l.resetsAt * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const tone = l.status === 'rejected' ? 'blocked' : l.status === 'allowed_warning' || (pct ?? 0) >= 80 ? 'in-progress' : 'done';
  return (
    <div className="limit">
      <div className="row between"><b>{LIMITS[name] ?? name}</b>
        <Pill status={tone}>{l.status === 'rejected' ? 'Limit reached' : pct == null ? (l.status === 'allowed_warning' ? 'Getting close' : 'OK') : `${pct}% used`}</Pill></div>
      {pct == null ? null : <ProgressBar pct={pct} color={`var(--${tone === 'done' ? 'accent' : tone === 'blocked' ? 'err' : 'warn'})`} />}
      {reset ? <div className="muted small">Resets {reset}</div> : null}
    </div>
  );
}

export function UsageView() {
  const data = useApp(s => s.usage);
  const period = useApp(s => s.usagePeriod);
  const pref = useApp(s => s.modelPref);
  const models = useApp(s => s.models);
  const chat = useChat();
  if (!data) return <div className="page"><Empty>Loading usage…</Empty></div>;
  const days = (PERIODS.find(x => x[0] === period) ?? PERIODS[1]!)[2];
  const t = totals(data, days);
  const rows = Object.entries(t.models).sort((a, b) => b[1].cost - a[1].cost);
  const projs = Object.values(t.projects).sort((a, b) => b.cost - a.cost);
  const limits = Object.entries(data.limits ?? {}).filter(([, l]) => Date.now() - (l.at ?? 0) < 7 * 864e5);
  const c = chat?.context;
  const last = chat?.lastUsage;

  return (
    <div className="page usage">
      <PageHead title="Usage" sub="What the agent has used through this app. Figures are estimates at API prices: on a Claude subscription you aren't billed per token, but usage counts against your plan limits." />
      <div className="two even">
        <Card pad><span className="lab">Your plan</span>
          {limits.length ? limits.map(([k, l]) => <LimitBar key={k} name={k} l={l} />)
            : <div className="muted small">Plan limits appear here once Claude reports them, after your first message in this app. They only exist for Claude subscriptions (not API keys or cloud providers).</div>}
        </Card>
        <Card pad><span className="lab">This chat</span>
          <div className="kv"><span className="muted">Model</span><b>{c?.model ? prettyModel(c.model) : (modelLabel(pref, models) || 'Default')}</b></div>
          <div className="kv"><span className="muted">Context used</span><b>{c ? `${Math.round(c.percentage)}% · ${fmt(c.totalTokens)} of ${fmt(c.maxTokens)} tokens` : 'Starts with your first message'}</b></div>
          {c ? <ProgressBar pct={c.percentage} color={`var(--${c.percentage >= 85 ? 'err' : c.percentage >= 65 ? 'warn' : 'accent'})`} /> : null}
          <div className="kv"><span className="muted">Cost so far</span><b>{last ? money(last.total) : '$0.000'} <span className="muted small">API-equivalent</span></b></div>
          {c && c.percentage >= 75 ? <Note tone="warn">The conversation is getting long. Start a new chat for unrelated work to keep answers sharp and cheaper.</Note> : null}
        </Card>
      </div>

      <Card pad>
        <div className="row between"><b>Totals</b><Segmented value={period} options={PERIODS.map(([k, label]) => [k, label])} onChange={v => setApp(s => { s.usagePeriod = v; })} /></div>
        <div className="kpis small4">
          <div className="kpi mini"><span className="lab">Messages</span><b>{t.all.turns}</b></div>
          <div className="kpi mini"><span className="lab">Tokens in</span><b>{fmt(t.all.input + t.all.cacheRead + t.all.cacheWrite)}</b><span className="muted small">{fmt(t.all.cacheRead)} from cache</span></div>
          <div className="kpi mini"><span className="lab">Tokens out</span><b>{fmt(t.all.output)}</b></div>
          <div className="kpi mini"><span className="lab">API-equivalent</span><b>{money(t.all.cost)}</b></div>
        </div>
        {rows.length ? (
          <table className="utable"><thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cost</th></tr></thead>
            <tbody>{rows.map(([m, u]) => <tr key={m}><td><b>{prettyModel(m)}</b></td><td>{fmt(u.input + u.cacheWrite)}</td><td>{fmt(u.output)}</td><td>{fmt(u.cacheRead)}</td><td>{money(u.cost)}</td></tr>)}</tbody></table>
        ) : <Empty small>No usage recorded in this period yet.</Empty>}
      </Card>

      {projs.length ? (
        <Card pad><b>By project</b>
          <table className="utable"><thead><tr><th>Project</th><th>Messages</th><th>Tokens (in + out)</th><th>Cost</th></tr></thead>
            <tbody>{projs.map(x => <tr key={x.name}><td><b>{x.name}</b></td><td>{x.turns}</td><td>{fmt(x.input + x.output)}</td><td>{money(x.cost)}</td></tr>)}</tbody></table>
        </Card>
      ) : null}
      <div className="muted small">Usage is counted from when this version of the app started recording. {plural(Object.keys(data.days ?? {}).length, 'day')} on record.</div>
    </div>
  );
}
