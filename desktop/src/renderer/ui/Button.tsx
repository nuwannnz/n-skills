import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'ghost' | 'danger' | 'deny' | 'stop';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'small' | 'big' };

export const Button = ({ variant, size, className, type = 'button', ...rest }: Props) => (
  <button type={type} className={cx('btn', variant, size === 'small' && 'small', size === 'big' && 'big-btn', className)} {...rest} />
);

/** A square button holding only an icon; `label` is its accessible name and tooltip. */
export const IconButton = ({ icon, size = 17, label, turn, className, type = 'button', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; size?: number; label: string; turn?: number; children?: ReactNode }) => (
  <button type={type} className={cx('icon-btn', className)} title={label} aria-label={label} {...rest}>
    <Icon name={icon} size={size} {...(turn ? { turn } : {})} />{children}
  </button>
);

/** A button styled as an inline text link. */
export const LinkButton = ({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type={type} className={cx('link', className)} {...rest} />
);

/** The small "tag" that names which agent role a button talks to. */
export const Tag = ({ children }: { children: ReactNode }) => <span className="tag">{children}</span>;
/** The slash in front of a skill action. */
export const Slash = () => <span className="slash">/</span>;
