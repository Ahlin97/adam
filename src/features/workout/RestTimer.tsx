// Rest timer panel and the "rest is over" full-screen signal.
import { Button } from '@/ui';
import { formatDuration } from '@/lib/format';
import { adjustRest, clearRest, type RestPhase, type RestState } from './restTimer';

export function RestTimerPanel({ state, remainingMs }: { state: RestState; remainingMs: number }) {
  const sec = Math.ceil(remainingMs / 1000);
  const pct = Math.min(100, Math.max(0, (remainingMs / 1000 / Math.max(1, state.totalSec)) * 100));
  return (
    <section aria-label="Vilotimer" className="rounded-2xl border border-accent/50 bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[8rem] flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Vila</div>
          <div className="tabular text-5xl font-black leading-none" role="timer" aria-live="off">
            {formatDuration(sec)}
          </div>
          {state.nextLabel && <div className="mt-1 text-sm text-muted">Nästa: {state.nextLabel}</div>}
        </div>
        <div className="flex shrink-0 gap-1 max-[420px]:w-full max-[420px]:[&>*]:flex-1">
          <Button size="lg" className="min-w-14 px-2" aria-label="Korta vilan 15 sekunder" onClick={() => void adjustRest(-15)}>
            −15
          </Button>
          <Button size="lg" className="min-w-14 px-2" aria-label="Förläng vilan 15 sekunder" onClick={() => void adjustRest(15)}>
            +15
          </Button>
          <Button size="lg" variant="ghost" className="px-2 text-base" onClick={() => void clearRest()}>
            Hoppa över
          </Button>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

export function RestDoneOverlay({ phase, state }: { phase: RestPhase; state: RestState | null }) {
  if (phase !== 'done') return null;
  return (
    <button
      type="button"
      className="animate-rest-flash fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center"
      onClick={() => void clearRest()}
      aria-label="Vilan är slut. Tryck för att stänga"
    >
      <span role="alert" className="text-5xl font-black">
        Vilan är slut!
      </span>
      {state?.nextLabel && <span className="text-2xl font-semibold">Nästa: {state.nextLabel}</span>}
      <span className="text-sm opacity-80">Tryck för att fortsätta</span>
    </button>
  );
}
