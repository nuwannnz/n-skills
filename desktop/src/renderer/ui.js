// Small helpers shared by every view: escaping, formatting, popovers, toasts, icons.
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const md = text => { try { return window.marked.parse(text, { gfm: true }); } catch { return `<pre>${esc(text)}</pre>`; } };
export const initials = name => (String(name).match(/[A-Za-z0-9]+/g) ?? ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const personColor = name => `hsl(${hue(name)} 42% 42%)`;
export const ago = t => {
  if (!t) return 'not synced yet';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 9000 : 5000);
}

/** One popover at a time, anchored under an element. */
export function showPop(anchor, html, { align = 'left', width } = {}) {
  const pop = $('#pop');
  pop.innerHTML = html;
  pop.hidden = false;
  if (width) pop.style.width = `${width}px`;
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 12)}px`;
  const left = align === 'right' ? r.right - pop.offsetWidth : r.left;
  pop.style.left = `${Math.max(12, Math.min(left, innerWidth - pop.offsetWidth - 12))}px`;
  return pop;
}
export const closePop = () => { $('#pop').hidden = true; };

/** Icon glyphs (24px grid, stroke) and the pastel colour each navigation item uses. */
const GLYPH = {
  guide: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  usage: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  changes: '<path d="M4 20l4-1 10-10-3-3L5 16z"/>',
  sprint: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  backlog: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  board: '<rect x="4" y="5" width="4.5" height="14" rx="1"/><rect x="10" y="5" width="4.5" height="9" rx="1"/><rect x="16" y="5" width="4" height="11" rx="1"/>',
  epics: '<path d="M6 4v17M6 5h12l-2.5 4L18 13H6"/>',
  docs: '<path d="M7 3h7l4 4v14H7zM14 3v4h4"/>',
  checks: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.5 2.5 4.5-5"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.5a3 3 0 0 1 0 5.6M18 14c1.7.7 3 2.3 3 4.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M10 4v16"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-12 2-12 5"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  update: '<circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
};
export const NAV_COLOR = {
  guide: 'var(--accent)', usage: '#0891b2',
  chat: 'var(--blue)', changes: 'var(--warn)', sprint: 'var(--accent)', backlog: 'var(--purple)', board: '#c2417a',
  epics: 'var(--ok)', docs: '#6b5ce0', checks: '#0e7c86', team: '#d9822b',
};
export const icon = (name, size = 16, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${GLYPH[name] ?? ''}</svg>`;
export const navIcon = name => `<span class="ic" style="--c:${NAV_COLOR[name]}">${icon(name, 14)}</span>`;
