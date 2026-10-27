// Big-touch-target numeric inputs used by the logger, set editor and plate calculator.
import { Minus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Equipment, Unit } from '@/engine';
import { Button, Chip, cx } from '@/ui';
import { SET_TYPE_LABELS } from '@/lib/labels';
import type { SetType } from '@/engine';
import { fmtNum, toKg, toUnit } from './safeEngine';

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** − value + with tap-to-type on the value. All values in display units. */
export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  suffix,
  decimals = 2,
  size = 'lg',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  suffix?: string;
  decimals?: number;
  size?: 'md' | 'lg';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const btn = size === 'lg' ? 'min-h-16 min-w-16 rounded-2xl' : 'min-h-12 min-w-12 rounded-xl';
  const icon = size === 'lg' ? 26 : 20;
  const commit = () => {
    const n = parseFloat(draft.replace(',', '.').replace(/\s/g, ''));
    if (Number.isFinite(n)) onChange(Math.max(min, round3(n)));
    setEditing(false);
  };
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button className={btn} aria-label={`Minska ${label}`} onClick={() => onChange(Math.max(min, round3(value - step)))}>
        <Minus aria-hidden size={icon} strokeWidth={3} />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <div className="truncate text-xs font-bold uppercase tracking-wider text-muted">{label}</div>
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            aria-label={label}
            className="tabular w-full rounded-lg border border-accent bg-surface-2 text-center text-3xl font-bold text-fg"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className={cx('tabular w-full rounded-xl font-black tracking-tight active:bg-surface-2', size === 'lg' ? 'text-4xl' : 'text-xl')}
            aria-label={`${label}: ${fmtNum(value, decimals)}${suffix ? ' ' + suffix : ''}. Tryck för att skriva in`}
            onClick={() => {
              setDraft(fmtNum(value, decimals).replace(/\s/g, ''));
              setEditing(true);
            }}
          >
            <span aria-live="polite">{fmtNum(value, decimals)}</span>
            {suffix && <span className="ml-1 text-base font-medium text-muted">{suffix}</span>}
            {/* Shows the number can be tapped to type a value. */}
            {size === 'lg' && <Pencil aria-hidden size={14} className="ml-1.5 inline-block align-super text-muted" />}
          </button>
        )}
      </div>
      <Button className={btn} aria-label={`Öka ${label}`} onClick={() => onChange(round3(value + step))}>
        <Plus aria-hidden size={icon} strokeWidth={3} />
      </Button>
    </div>
  );
}

/** Display step in the user's unit for a kg step. */
export function displayStep(stepKg: number, unit: Unit): number {
  if (unit === 'kg') return stepKg;
  return Math.max(2.5, Math.round(toUnit(stepKg, unit) / 2.5) * 2.5);
}

/** Weight stepper storing kilograms but showing the user's unit. */
export function WeightStepper({
  label,
  kg,
  onChange,
  stepKg,
  unit,
  size,
}: {
  label: string;
  kg: number;
  onChange: (kg: number) => void;
  stepKg: number;
  unit: Unit;
  size?: 'md' | 'lg';
}) {
  const shown = unit === 'kg' ? kg : Math.round(toUnit(kg, unit) * 10) / 10;
  return (
    <NumberStepper
      label={label}
      value={shown}
      step={displayStep(stepKg, unit)}
      size={size}
      onChange={(v) => onChange(unit === 'kg' ? v : round3(toKg(v, unit)))}
    />
  );
}

/** Quick jumps in kg by equipment: what you actually change between sets on that kind of gear. */
const JUMPS_KG: Partial<Record<Equipment, number[]>> = {
  barbell: [-10, -5, 5, 10],
  machine: [-10, -5, 5, 10],
  cable: [-10, -5, 5, 10],
  dumbbell: [-4, -2, 2, 4],
  kettlebell: [-8, -4, 4, 8],
  bodyweight: [-5, -2.5, 2.5, 5],
};

/** The four jumps shown (in display units); lb and unknown gear fall back to ±2/±4 steps. */
export function weightJumps(equipment: Equipment | undefined, stepKg: number, unit: Unit): number[] {
  const kg = equipment ? JUMPS_KG[equipment] : undefined;
  if (kg && unit === 'kg') return kg;
  const step = displayStep(stepKg, unit);
  return [-4, -2, 2, 4].map((n) => n * step);
}

/** Row of quick jumps for bigger weight changes in one tap. */
export function WeightJumps({
  kg,
  onChange,
  stepKg,
  unit,
  equipment,
}: {
  kg: number;
  onChange: (kg: number) => void;
  stepKg: number;
  unit: Unit;
  equipment?: Equipment;
}) {
  const shown = unit === 'kg' ? kg : toUnit(kg, unit);
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Snabbändra vikt">
      {weightJumps(equipment, stepKg, unit).map((delta) => {
        const next = Math.max(0, round3(shown + delta));
        return (
          <Button
            key={delta}
            size="sm"
            className="tabular min-h-11 rounded-xl text-sm font-bold"
            disabled={shown + delta < 0}
            aria-label={`${delta > 0 ? 'Öka' : 'Minska'} vikten med ${fmtNum(Math.abs(delta))} ${unit}`}
            onClick={() => onChange(unit === 'kg' ? next : round3(toKg(next, unit)))}
          >
            {delta > 0 ? '+' : '−'}
            {fmtNum(Math.abs(delta))}
          </Button>
        );
      })}
    </div>
  );
}

export const SET_TYPES: SetType[] = ['warmup', 'working', 'drop', 'failure'];

export function SetTypePicker({ value, onChange }: { value: SetType; onChange: (t: SetType) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Settyp">
      {SET_TYPES.map((t) => (
        <Chip key={t} active={value === t} onClick={() => onChange(t)}>
          {SET_TYPE_LABELS[t]}
        </Chip>
      ))}
    </div>
  );
}

export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export function RpePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="RPE">
      <Chip active={value == null} onClick={() => onChange(null)}>
        Inget
      </Chip>
      {RPE_VALUES.map((r) => (
        <Chip key={r} active={value === r} onClick={() => onChange(value === r ? null : r)}>
          {fmtNum(r, 1)}
        </Chip>
      ))}
    </div>
  );
}

export function TypeBadge({ type }: { type: SetType }) {
  const color: Record<SetType, string> = {
    warmup: 'bg-warn/20 text-warn',
    working: 'bg-accent/15 text-accent',
    drop: 'bg-surface-2 text-fg',
    failure: 'bg-bad/20 text-bad',
  };
  return <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', color[type])}>{SET_TYPE_LABELS[type]}</span>;
}
