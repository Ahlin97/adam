const dateFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
const longDateFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const numFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatLongDate = (d: Date | string) => longDateFmt.format(new Date(d));
export const formatTime = (d: Date | string) => timeFmt.format(new Date(d));
export const formatNumber = (n: number) => numFmt.format(n);

/** 95 → "1:35", 3700 → "1:01:40" */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Length of a finished pass in words: "under 1 min", "45 min", "1 h 5 min". Timers keep formatDuration. */
export function formatSessionLength(totalSec: number): string {
  if (totalSec < 60) return 'under 1 min';
  const min = Math.round(totalSec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Local date key "2026-10-24". */
export function dayKey(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
