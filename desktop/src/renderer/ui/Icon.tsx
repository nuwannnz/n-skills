import type { CSSProperties } from 'react';

/** Icon glyphs on a 24px grid, drawn with a stroke. */
const GLYPH = {
  guide: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  usage: <path d="M5 20V11M12 20V4M19 20v-6" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  changes: <path d="M4 20l4-1 10-10-3-3L5 16z" />,
  sprint: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  backlog: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  board: <><rect x="4" y="5" width="4.5" height="14" rx="1" /><rect x="10" y="5" width="4.5" height="9" rx="1" /><rect x="16" y="5" width="4" height="11" rx="1" /></>,
  epics: <path d="M6 4v17M6 5h12l-2.5 4L18 13H6" />,
  docs: <path d="M7 3h7l4 4v14H7zM14 3v4h4" />,
  checks: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.5 2.5 4.5-5" /></>,
  team: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.5a3 3 0 0 1 0 5.6M18 14c1.7.7 3 2.3 3 4.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M5.5 8.5h1M5.5 11.5h1" /></>,
  split: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M10 4v16" /></>,
  expand: <path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  branch: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8.5v7M18 10.5c0 4-12 2-12 5" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12l5 5 9-10" />,
  update: <><circle cx="12" cy="12" r="9" /><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" /></>,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
};
export type IconName = keyof typeof GLYPH;

/** `turn` rotates the glyph, in degrees (the chevron points down; 90 makes it a back arrow). */
export function Icon({ name, size = 16, turn, style }: { name: IconName; size?: number; turn?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={turn ? { transform: `rotate(${turn}deg)`, ...style } : style}>
      {GLYPH[name]}
    </svg>
  );
}

/** A navigation icon on its own pastel colour. */
export const NavIcon = ({ name, color }: { name: IconName; color: string }) => (
  <span className="ic" style={{ '--c': color } as CSSProperties}><Icon name={name} size={14} /></span>
);
