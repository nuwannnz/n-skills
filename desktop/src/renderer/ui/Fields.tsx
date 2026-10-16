import type { ReactNode } from 'react';
import { Icon } from './Icon';

export const SearchField = ({ value, placeholder, onChange, id }: { value: string; placeholder: string; onChange: (v: string) => void; id?: string }) => (
  <label className="search"><Icon name="search" size={15} /><input id={id} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label>
);

export const Switch = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="switch"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><i />{children}</label>
);

export const Check = ({ checked, onChange, small, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; small?: boolean; disabled?: boolean; children: ReactNode }) => (
  <label className={small ? 'check small' : 'check'}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /> {children}</label>
);

/** A row of tabs where one is picked. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([k, label]) => <button type="button" key={k} role="tab" aria-selected={k === value} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}
