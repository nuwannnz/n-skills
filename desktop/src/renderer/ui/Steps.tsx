import type { ReactNode } from 'react';
import { cx } from './cx';

export type Step = { label: string; state: 'done' | 'now' | 'bad' | ''; mark?: ReactNode };

/** A row of steps, such as a pull request's review journey. */
export const Steps = ({ steps, className }: { steps: Step[]; className?: string }) => (
  <div className={cx('journey', className)}>
    {steps.map(s => <div key={s.label} className={cx('step', s.state)}><i>{s.mark}</i>{s.label}</div>)}
  </div>
);
