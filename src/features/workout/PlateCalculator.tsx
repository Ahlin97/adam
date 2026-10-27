// Plate calculator: which plates to load per side for a target barbell weight.
import { useState } from 'react';
import { useSettings } from '@/db/hooks';
import { Sheet } from '@/ui';
import { WeightStepper } from './inputs';
import { fmtNum, fmtWeight, safePlates } from './safeEngine';

const PLATE_STYLE: Record<string, string> = {
  '25': 'bg-red-600',
  '20': 'bg-blue-600',
  '15': 'bg-yellow-400',
  '10': 'bg-green-600',
  '5': 'bg-neutral-100',
  '2.5': 'bg-neutral-800 border border-neutral-500',
  '1.25': 'bg-neutral-400',
};

function plateHeight(kg: number, max: number): number {
  // 40 %–100 % of the tallest plate.
  return 40 + 60 * Math.sqrt(kg / max);
}

export function PlateStack({ perSide, maxPlate }: { perSide: number[]; maxPlate: number }) {
  return (
    <div className="flex h-36 items-center justify-center" aria-hidden>
      <div className="h-3 w-16 rounded-l bg-neutral-500" />
      <div className="h-6 w-2 bg-neutral-400" />
      {perSide.map((p, i) => (
        <div
          key={i}
          className={`mx-px flex w-5 items-center justify-center rounded-sm ${PLATE_STYLE[String(p)] ?? 'bg-neutral-300'}`}
          style={{ height: `${plateHeight(p, maxPlate)}%` }}
        />
      ))}
      <div className="h-3 w-6 rounded-r bg-neutral-500" />
    </div>
  );
}

/** "2 × 20 + 5 + 1,25" for plates per side (largest first). */
export function platesText(perSide: number[]): string {
  const groups: { kg: number; n: number }[] = [];
  for (const p of perSide) {
    const last = groups[groups.length - 1];
    if (last && last.kg === p) last.n++;
    else groups.push({ kg: p, n: 1 });
  }
  return groups.map((g) => (g.n > 1 ? `${g.n} × ${fmtNum(g.kg)}` : fmtNum(g.kg))).join(' + ');
}

/** One line under the weight on the set card: what to load per side, or why it does not add up. */
export function PlateHint({ kg }: { kg: number }) {
  const settings = useSettings();
  if (settings.unit !== 'kg' || kg <= 0) return null;
  const r = safePlates(kg, settings.barWeight, settings.plates);
  const text =
    kg <= settings.barWeight
      ? kg === settings.barWeight
        ? 'Bara stången'
        : null
      : r.perSide.length === 0
        ? null
        : `${platesText(r.perSide)} per sida${r.remainder > 0 ? ` (≈ ${fmtWeight(r.achievedTotal, 'kg')})` : ''}`;
  if (!text) return null;
  return <p className="tabular text-center text-sm font-semibold text-muted">Skivor: {text}</p>;
}

export function PlateCalculatorBody({ initialKg }: { initialKg?: number }) {
  const settings = useSettings();
  const [target, setTarget] = useState(() => Math.max(settings.barWeight, initialKg ?? settings.barWeight + 40));
  const plates = [...settings.plates].sort((a, b) => b - a);
  const result = safePlates(target, settings.barWeight, plates);
  const counts = new Map<number, number>();
  for (const p of result.perSide) counts.set(p, (counts.get(p) ?? 0) + 1);
  const unit = settings.unit;

  return (
    <div className="space-y-4">
      <WeightStepper label={`Målvikt (${unit})`} kg={target} stepKg={2.5} unit={unit} onChange={(v) => setTarget(Math.max(0, v))} />
      <p className="text-center text-sm text-muted">Stång {fmtWeight(settings.barWeight, unit)}</p>
      <PlateStack perSide={result.perSide} maxPlate={plates[0] ?? 25} />
      <div aria-live="polite">
        <h3 className="mb-2 font-semibold">Per sida</h3>
        {result.perSide.length === 0 ? (
          <p className="text-muted">{target <= settings.barWeight ? 'Bara stången.' : 'Inga skivor räcker.'}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {[...counts.entries()].map(([p, n]) => (
              <li key={p} className="rounded-xl bg-surface-2 px-3 py-2 text-lg font-bold tabular">
                {n} × {fmtNum(p)} kg
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">
          Totalt pålastat: <span className="font-semibold text-fg">{fmtWeight(result.achievedTotal, unit)}</span>
        </p>
        {result.remainder > 0.001 && (
          <p className="mt-1 text-sm text-warn">Går inte att ladda exakt – {fmtWeight(result.remainder, unit)} saknas.</p>
        )}
      </div>
    </div>
  );
}

/** Bottom sheet with the plate calculator. `initialKg` = target weight in kg. */
export default function PlateCalculator({ open, onClose, initialKg }: { open: boolean; onClose: () => void; initialKg?: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Skivkalkylator">
      {open && <PlateCalculatorBody initialKg={initialKg} />}
    </Sheet>
  );
}

export { PlateCalculator };
