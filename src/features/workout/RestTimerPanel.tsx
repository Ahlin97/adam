// Rest timer panel and the "rest is over" full-screen signal.
import { BellRing, Minus, Plus, SkipForward } from 'lucide-react';
import { Button } from '@/ui';
import { formatDuration } from '@/lib/format';
import { adjustRest, clearRest, type RestPhase, type RestState } from './restTimer';

/** One compact row: time left, a thin progress bar, ±15 s and skip. The next set is already on the card below. */
export function RestTimerPanel({ state, remainingMs }: { state: RestState; remainingMs: number }) {
  const sec = Math.ceil(remainingMs / 1000);
  const fraction = Math.min(1, Math.max(0, remainingMs / 1000 / Math.max(1, state.totalSec)));
  return (
    <section aria-label="Vilotimer" className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Vila</span>
        <span className="tabular min-w-0 flex-1 text-2xl font-black tracking-tight" role="timer" aria-live="off">
          {formatDuration(sec)}
        </span>
        <Button size="sm" className="min-h-11 px-3" aria-label="Korta vilan 15 sekunder" onClick={() => void adjustRest(-15)}>
          <Minus aria-hidden size={14} strokeWidth={3} />15
        </Button>
        <Button size="sm" className="min-h-11 px-3" aria-label="Förläng vilan 15 sekunder" onClick={() => void adjustRest(15)}>
          <Plus aria-hidden size={14} strokeWidth={3} />15
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 min-w-11 px-0" aria-label="Hoppa över vilan" onClick={() => void clearRest()}>
          <SkipForward aria-hidden size={20} />
        </Button>
      </div>
      <div aria-hidden className="h-1 bg-surface-2">
        <div className="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${fraction * 100}%` }} />
      </div>
    </section>
  );
}

export function RestDoneOverlay({ phase, state }: { phase: RestPhase; state: RestState | null }) {
  if (phase !== 'done') return null;
  return (
    <button
      type="button"
      className="animate-rest-flash fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 p-6 text-center"
      onClick={() => void clearRest()}
      aria-label="Vilan är slut. Tryck för att stänga"
    >
      <BellRing aria-hidden size={56} strokeWidth={2.5} />
      <span role="alert" className="text-5xl font-black tracking-tight">
        Vilan är slut!
      </span>
      {state?.nextLabel && <span className="text-2xl font-bold">Nästa: {state.nextLabel}</span>}
      <span className="rounded-full bg-accent-fg/10 px-4 py-2 text-sm font-semibold">Tryck för att fortsätta</span>
    </button>
  );
}
