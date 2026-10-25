// Rest timer panel and the "rest is over" full-screen signal.
import { BellRing, Minus, Plus, SkipForward } from 'lucide-react';
import { Button } from '@/ui';
import { formatDuration } from '@/lib/format';
import { adjustRest, clearRest, type RestPhase, type RestState } from './restTimer';

/** Circular countdown ring. `fraction` = remaining share (1 → 0). */
function Ring({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function RestTimerPanel({ state, remainingMs }: { state: RestState; remainingMs: number }) {
  const sec = Math.ceil(remainingMs / 1000);
  const fraction = Math.min(1, Math.max(0, remainingMs / 1000 / Math.max(1, state.totalSec)));
  return (
    <section aria-label="Vilotimer" className="card flex items-center gap-4 p-3">
      <Ring fraction={fraction}>
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted">Vila</span>
        <span className="tabular text-[1.7rem] font-black leading-none tracking-tight" role="timer" aria-live="off">
          {formatDuration(sec)}
        </span>
      </Ring>
      <div className="min-w-0 flex-1 space-y-2">
        {state.nextLabel && (
          <p className="text-sm leading-snug">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted">Nästa</span>
            <span className="font-bold">{state.nextLabel}</span>
          </p>
        )}
        <div className="flex gap-1.5">
          <Button size="md" className="flex-1 px-0" aria-label="Korta vilan 15 sekunder" onClick={() => void adjustRest(-15)}>
            <Minus aria-hidden size={16} strokeWidth={3} />15
          </Button>
          <Button size="md" className="flex-1 px-0" aria-label="Förläng vilan 15 sekunder" onClick={() => void adjustRest(15)}>
            <Plus aria-hidden size={16} strokeWidth={3} />15
          </Button>
          <Button size="md" variant="ghost" className="flex-1 px-0" aria-label="Hoppa över vilan" onClick={() => void clearRest()}>
            <SkipForward aria-hidden size={20} />
          </Button>
        </div>
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
