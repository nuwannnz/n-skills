import type { Burndown as Data } from '../../lib/data';

/** Ideal, actual and projected remaining points over the sprint's working days. */
export function Burndown({ b }: { b: Data }) {
  const W = 780, H = 300, x0 = 50, x1 = 730, y0 = 20, y1 = 260;
  const n = b.days.length;
  const X = (i: number) => x0 + ((x1 - x0) * i) / n;
  const Y = (v: number) => y1 - ((y1 - y0) * v) / b.total;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(b.total * f * 10) / 10);
  let actual = `M${X(0)} ${Y(b.total)}`;
  let prev = b.total;
  for (const a of b.actual) { actual += ` H${X(a.i - 1)} V${Y(a.remaining)}`; prev = a.remaining; }
  if (b.actual.length) actual += ` H${X(b.actual.length)}`;
  const t = b.todayIndex;
  const label = (i: number) => b.days[Math.max(0, Math.min(n - 1, i - 1))]!.slice(5).replace('-', '/');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Burndown chart: ${b.remaining} of ${b.total} points remaining`} className="burn">
      {ticks.map(v => <g key={v}><line x1={x0} y1={Y(v)} x2={x1} y2={Y(v)} className="grid" /><text x="40" y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
      {[...new Set([0, Math.floor(n / 2), n])].map(i => <text key={i} x={X(i)} y="282" textAnchor="middle" className="ax">{i === 0 ? 'Start' : label(i)}</text>)}
      {t > 0 ? <rect x={X(t)} y={y0 - 6} width={x1 - X(t)} height={y1 - y0 + 6} className="future" /> : null}
      <line x1={X(0)} y1={Y(b.total)} x2={x1} y2={y1} className="ideal" />
      {b.actual.length ? <path d={actual} className="actual" /> : null}
      {t > 0 && t < n ? <path d={`M${X(t)} ${Y(prev)} L${x1} ${Y(b.projectedEnd)}`} className="proj" /> : null}
      {t > 0 ? <>
        <line x1={X(t)} y1={y0 - 6} x2={X(t)} y2={y1} className="today" />
        <circle cx={X(t)} cy={Y(b.remaining)} r="6" className="dotnow" />
        <text x={X(t) + 8} y={Y(b.remaining) - 8} className="lbl">{b.remaining} left</text>
      </> : null}
    </svg>
  );
}
