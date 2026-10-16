import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export const Card = ({ pad, list, className, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: boolean; list?: boolean }) => (
  <div className={cx('card', pad && 'pad', list && 'list', className)} {...rest} />
);

/** An empty state: a bold line and an explanation. */
export const Empty = ({ title, small, className, children }: { title?: ReactNode; small?: boolean; className?: string; children?: ReactNode }) => (
  <div className={cx('empty', small && 'small', className)}>{title ? <b>{title}</b> : null}{children}</div>
);

export const Note = ({ tone, children }: { tone?: 'ok' | 'warn' | 'bad'; children: ReactNode }) => (
  <div className={cx('note', tone)}>{children}</div>
);

/** A page heading with an optional subtitle on the left and actions on the right. */
export const PageHead = ({ title, after, sub, children }: { title: ReactNode; after?: ReactNode; sub?: ReactNode; children?: ReactNode }) => (
  <div className="page-head">
    <div>
      <div className="title-row"><h1>{title}</h1>{after}</div>
      {sub ? <div className="muted">{sub}</div> : null}
    </div>
    {children}
  </div>
);

export const Label = ({ children }: { children: ReactNode }) => <div className="lab">{children}</div>;
export const Grow = () => <span className="grow" />;
export const Spinner = () => <span className="spin" />;
export const Kbd = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;
