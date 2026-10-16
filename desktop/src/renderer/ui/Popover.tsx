import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = { anchor: HTMLElement | null; onClose: () => void; align?: 'left' | 'right'; width?: number; children: ReactNode };

/**
 * A floating panel under an element. It closes on a click outside itself and its
 * anchor (so the anchor can toggle it), and on Escape.
 */
export function Popover({ anchor, onClose, align = 'left', width, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const pop = ref.current;
    if (!pop || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 12);
    const left = align === 'right' ? r.right - pop.offsetWidth : r.left;
    setPos({ top, left: Math.max(12, Math.min(left, innerWidth - pop.offsetWidth - 12)) });
  }, [anchor, align, width]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) close.current();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [anchor]);

  if (!anchor) return null;
  return createPortal(
    <div ref={ref} className="pop" style={{ width, top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}>{children}</div>,
    document.body,
  );
}

/** Holds which popover is open and what it is anchored to. */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: anchor !== null,
    toggle: (el: HTMLElement) => setAnchor(a => (a === el ? null : el)),
    close: () => setAnchor(null),
  };
}
