import type { ReactNode } from 'react';
import { cx } from './cx';
import { LinkButton } from './Button';
import { ColorDot } from './Pill';

export const Menu = ({ title, children }: { title?: ReactNode; children: ReactNode }) => (
  <div className="menu">{title ? <div className="lab">{title}</div> : null}{children}</div>
);

export const MenuItem = ({ onClick, className, children }: { onClick: () => void; className?: string; children: ReactNode }) => (
  <button type="button" className={cx('mrow', className)} onClick={onClick}>{children}</button>
);

export const MenuFoot = ({ children }: { children: ReactNode }) => <div className="mfoot">{children}</div>;

export type CheckOption = { value: string; label: string; dot?: string; count?: number };

/** A menu of tick boxes. Every tick reports the whole new selection. */
export function CheckMenu({ title, options, selected, onChange, disabled, foot }: {
  title: ReactNode; options: CheckOption[]; selected: string[]; onChange: (values: string[], changed: string) => void; disabled?: boolean; foot?: ReactNode;
}) {
  const toggle = (v: string, on: boolean) => onChange(on ? [...selected, v] : selected.filter(x => x !== v), v);
  return (
    <Menu title={title}>
      {options.map(o => {
        const on = selected.includes(o.value);
        return (
          <label key={o.value} className={cx('mrow', on && 'on')}>
            <input type="checkbox" value={o.value} checked={on} disabled={disabled} onChange={e => toggle(o.value, e.target.checked)} />
            {o.dot ? <ColorDot color={o.dot} /> : null}<span>{o.label}</span>{o.count != null ? <em>{o.count}</em> : null}
          </label>
        );
      })}
      {foot ? <MenuFoot>{foot}</MenuFoot> : null}
    </Menu>
  );
}

/** "Select all" and "Clear" links for a CheckMenu footer. */
export const AllNone = ({ onAll, onNone }: { onAll: () => void; onNone: () => void }) => (
  <><LinkButton onClick={onAll}>Select all</LinkButton><LinkButton onClick={onNone}>Clear</LinkButton></>
);
