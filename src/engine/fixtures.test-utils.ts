// Shared fixtures for engine tests (not part of the engine API; excluded from engine:sync).
import type { EquipmentProfile, Exercise, ExerciseHistoryEntry, Prescription, SetType } from './types.ts';

export const profile: EquipmentProfile = {
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbells: [],
  kettlebells: [],
  defaultSteps: {
    barbellLower: 5,
    barbellUpper: 2.5,
    dumbbell: 2,
    machine: 5,
    cable: 5,
    kettlebell: 4,
    bodyweight: 2.5,
    other: 2.5,
  },
};

export function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex1',
    name: 'Bänkpress',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    category: 'compound',
    measure: 'weight_reps',
    unilateral: false,
    bodyweightMode: 'none',
    weightStep: null,
    notes: '',
    isCustom: false,
    isFavorite: false,
    ...over,
  };
}

export function rx(over: Partial<Prescription> = {}): Prescription {
  return { sets: 3, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double', ...over };
}

export const NOW = new Date('2026-10-24T12:00:00Z');
export const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

export function entry(
  daysBack: number,
  weight: number,
  reps: number[],
  opts: { rpe?: (number | null)[]; prescription?: Prescription; type?: SetType; durationSec?: number[] } = {},
): ExerciseHistoryEntry {
  return {
    sessionId: `s${daysBack}`,
    date: daysAgo(daysBack),
    prescription: opts.prescription ?? rx(),
    sets: reps.map((r, i) => ({
      type: opts.type ?? 'working',
      reps: r,
      weight,
      rpe: opts.rpe?.[i] ?? null,
      durationSec: opts.durationSec?.[i] ?? null,
    })),
  };
}
