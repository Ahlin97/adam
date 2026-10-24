import { useEffect, useState } from 'react';

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void };

/** Keep the screen on while mounted. Returns whether the Wake Lock API is supported. */
export function useWakeLock(enabled = true): { supported: boolean; active: boolean } {
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
  const supported = !!wl;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!wl || !enabled) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await wl.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener?.('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      setActive(false);
    };
  }, [wl, enabled]);

  return { supported, active };
}
