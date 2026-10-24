import { defaultStepFor, formatWeight, isLowerBody, weightStepFor, type EquipmentProfile, type Exercise, type Unit } from '@/engine';

/** Call an engine function that may still be a throwing stub; return fallback on error. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower_back']);

/** Standard step for an exercise ignoring its own weightStep. */
export function standardStep(ex: Exercise, profile: EquipmentProfile): number {
  const base = { ...ex, weightStep: null };
  return safe(
    () => weightStepFor(base, profile),
    safe(
      () => defaultStepFor(ex.equipment, safe(() => isLowerBody(ex.primaryMuscle), LOWER.has(ex.primaryMuscle)), profile),
      (() => {
        const s = profile.defaultSteps;
        switch (ex.equipment) {
          case 'barbell':
            return LOWER.has(ex.primaryMuscle) ? s.barbellLower : s.barbellUpper;
          default:
            return s[ex.equipment];
        }
      })(),
    ),
  );
}

export function fmtWeight(kg: number, unit: Unit): string {
  return safe(() => formatWeight(kg, unit), `${String(kg).replace('.', ',')} kg`);
}
