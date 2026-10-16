import type { CSSProperties, ReactNode } from 'react';
import { STATUS_LABEL } from '../lib/data';
import { cx } from './cx';

/** A rounded label. `status` and `pr` pick its colour from the theme. */
export const Pill = ({ status, pr, className, title, children }: { status?: string; pr?: string; className?: string; title?: string; children: ReactNode }) => (
  <span className={cx('pill', className)} data-s={status} data-pr={pr} title={title}>{children}</span>
);

export const StatusPill = ({ status, title }: { status: string; title?: string }) => (
  <Pill status={status} {...(title ? { title } : {})}>{STATUS_LABEL[status] ?? status}</Pill>
);

export const RolePill = ({ children }: { children: ReactNode }) => <span className="pill role">{children}</span>;

export const StatusDot = ({ status }: { status: string | undefined }) => <i className="sdot" data-s={status} />;

export const Badge = ({ tone, children }: { tone?: 'warn' | 'err' | 'ok'; children: ReactNode }) => (
  <span className={cx('badge', tone)}>{children}</span>
);

/** A small count beside a navigation item. */
export const Count = ({ children }: { children: ReactNode }) => <span className="n">{children}</span>;

export const ColorDot = ({ color, big, title }: { color: string; big?: boolean; title?: string }) => (
  <i className={cx('edot', big && 'big')} style={{ background: color }} title={title} />
);

/** A round avatar with initials. Leave `initials` out for the "unassigned" placeholder. */
export const Avatar = ({ initials, color, title, big }: { initials?: string; color?: string; title?: string; big?: boolean }) =>
  initials
    ? <span className={cx('av', big && 'big')} style={{ background: color }} title={title}>{initials}</span>
    : <span className="av none" title={title ?? 'Unassigned'}>?</span>;

/** A thin progress bar, filled to `pct` (0 to 100). */
export const ProgressBar = ({ pct, color, className }: { pct: number; color?: string; className?: string }) => (
  <div className={cx('bar', className)}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, ...(color ? { background: color } : {}) } as CSSProperties} /></div>
);
