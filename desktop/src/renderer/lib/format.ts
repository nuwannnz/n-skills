// Small formatting helpers shared by every feature.

export const initials = (name: string) => (String(name).match(/[A-Za-z0-9]+/g) ?? ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const hue = (s: string) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const personColor = (name: string) => `hsl(${hue(name)} 42% 42%)`;

export const ago = (t: number | null | undefined) => {
  if (!t) return 'not synced yet';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const elapsed = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const homePath = (path: string) => path.replace(/^\/Users\/[^/]+/, '~');

export const prettyModel = (id: string) => {
  const m = String(id).replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '');
  const parts = m.split('-');
  const name = parts.filter(x => !/^\d+$/.test(x)).map(x => x[0]!.toUpperCase() + x.slice(1)).join(' ');
  const ver = parts.filter(x => /^\d+$/.test(x)).join('.');
  return `${name || m}${ver ? ' ' + ver : ''}`.trim();
};
