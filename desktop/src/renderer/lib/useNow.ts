import { useEffect, useState } from 'react';

/** The current time, refreshed every `ms` while `on`, for clocks and "5 min ago" labels. */
export function useNow(ms: number, on = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return now;
}
