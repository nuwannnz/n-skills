import { create } from 'zustand';

type Toast = { id: number; text: string; kind: '' | 'err' };
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let next = 1;

/** Shows a short message in the corner. Errors stay longer. */
export function toast(text: string, kind: '' | 'err' = '') {
  const id = next++;
  useToasts.setState(s => ({ list: [...s.list, { id, text, kind }] }));
  setTimeout(() => useToasts.setState(s => ({ list: s.list.filter(t => t.id !== id) })), kind === 'err' ? 9000 : 5000);
}

export function Toasts() {
  const list = useToasts(s => s.list);
  return <div className="toasts">{list.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}
