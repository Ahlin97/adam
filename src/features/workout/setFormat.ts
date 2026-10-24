// Formatting helpers for sets in the workout and history views.
import type { Exercise, ExerciseHistoryEntry, SetEntry, Unit } from '@/engine';
import { fmtNum, fmtWeight } from './safeEngine';

type LiteSet = Pick<SetEntry, 'type' | 'reps' | 'weight' | 'durationSec'>;

export function isTime(ex: Exercise | undefined): boolean {
  return ex?.measure === 'time';
}

export function isBodyweight(ex: Exercise | undefined): boolean {
  return !!ex && (ex.measure === 'bodyweight_reps' || ex.equipment === 'bodyweight' || ex.bodyweightMode !== 'none');
}

/** Label for the weight input, e.g. "Vikt (kg per hand)", "Extravikt (kg)". */
export function weightLabel(ex: Exercise | undefined, unit: Unit): string {
  if (ex && isBodyweight(ex)) {
    return ex.bodyweightMode === 'assisted' ? `Assistans (${unit})` : `Extravikt (${unit})`;
  }
  if (ex?.unilateral) return `${unit} per hand/sida`;
  return `Vikt (${unit})`;
}

/** Weight part of a set, e.g. "82,5 kg", "KV + 10 kg", "KV − 20 kg". */
export function weightText(weightKg: number, ex: Exercise | undefined, unit: Unit): string {
  if (ex && isBodyweight(ex)) {
    if (!weightKg) return 'KV';
    return ex.bodyweightMode === 'assisted' ? `KV − ${fmtWeight(weightKg, unit)}` : `KV + ${fmtWeight(weightKg, unit)}`;
  }
  return fmtWeight(weightKg, unit) + (ex?.unilateral ? '/sida' : '');
}

export function secondsText(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** One set, e.g. "10 × 82,5 kg" or "45 s". */
export function setText(set: LiteSet, ex: Exercise | undefined, unit: Unit): string {
  if (isTime(ex)) {
    const t = secondsText(set.durationSec ?? set.reps);
    return set.weight ? `${t} @ ${weightText(set.weight, ex, unit)}` : t;
  }
  return `${set.reps} × ${weightText(set.weight, ex, unit)}`;
}

/**
 * Compact description of several sets:
 * "3 × 10 @ 60 kg", "12/11/10 @ 80 kg", or "10 @ 60 kg, 8 @ 65 kg" when the weights differ.
 */
export function describeSets(sets: LiteSet[], ex: Exercise | undefined, unit: Unit): string {
  if (!sets.length) return '';
  if (isTime(ex)) {
    const secs = sets.map((s) => s.durationSec ?? s.reps);
    return secs.every((x) => x === secs[0]) ? `${secs.length} × ${secondsText(secs[0])}` : secs.map(secondsText).join(' / ');
  }
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  if (sameWeight) {
    const reps = sets.map((s) => s.reps);
    const r = reps.every((x) => x === reps[0]) ? `${reps.length} × ${reps[0]}` : reps.join('/');
    return `${r} @ ${weightText(sets[0].weight, ex, unit)}`;
  }
  return sets.map((s) => `${s.reps} @ ${weightText(s.weight, ex, unit)}`).join(', ');
}

/** "Förra gången: …" text from the most recent history entry (working sets; falls back to all non-warmup). */
export function lastTimeText(entry: ExerciseHistoryEntry | undefined, ex: Exercise | undefined, unit: Unit): string | null {
  if (!entry) return null;
  let sets = entry.sets.filter((s) => s.type === 'working');
  if (!sets.length) sets = entry.sets.filter((s) => s.type !== 'warmup');
  if (!sets.length) return null;
  return describeSets(sets, ex, unit);
}

export function volumeText(kg: number, unit: Unit): string {
  return `${fmtNum(Math.round(unit === 'lb' ? kg / 0.45359237 : kg), 0)} ${unit}`;
}
