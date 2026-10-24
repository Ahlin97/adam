// Thin wrappers around the progression engine with local fallbacks, so the workout UI
// keeps working even if an engine function throws.
import {
  formatWeight,
  kgToUnit,
  newRecords,
  nextSetInSession,
  platesPerSide,
  suggestNext,
  summarizeSession,
  unitToKg,
  weightStepFor,
  type EquipmentProfile,
  type Exercise,
  type ExerciseHistoryEntry,
  type NextSet,
  type PlateResult,
  type Prescription,
  type SessionExercise,
  type SessionSummary,
  type SetEntry,
  type Settings,
  type Suggestion,
  type Unit,
  type WorkoutSession,
} from '@/engine';

const KG_PER_LB = 0.45359237;

function attempt<T>(fn: () => T, fallback: () => T): T {
  try {
    const v = fn();
    return v === undefined ? fallback() : v;
  } catch {
    return fallback();
  }
}

export function toUnit(kg: number, unit: Unit): number {
  return attempt(
    () => kgToUnit(kg, unit),
    () => (unit === 'lb' ? kg / KG_PER_LB : kg),
  );
}

export function toKg(value: number, unit: Unit): number {
  return attempt(
    () => unitToKg(value, unit),
    () => (unit === 'lb' ? value * KG_PER_LB : value),
  );
}

export function fmtNum(n: number, maxDecimals = 2): string {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: maxDecimals }).replace(/ /g, ' ');
}

export function fmtWeight(kg: number, unit: Unit, withUnit = true): string {
  return attempt(
    () => formatWeight(kg, unit, { withUnit }),
    () => {
      const t = fmtNum(toUnit(kg, unit), unit === 'lb' ? 1 : 2);
      return withUnit ? `${t} ${unit}` : t;
    },
  );
}

export function stepFor(ex: Exercise, profile: EquipmentProfile): number {
  return attempt(
    () => weightStepFor(ex, profile),
    () => {
      if (ex.weightStep && ex.weightStep > 0) return ex.weightStep;
      const s = profile.defaultSteps;
      switch (ex.equipment) {
        case 'barbell':
          return ['quads', 'hamstrings', 'glutes', 'calves', 'lower_back', 'adductors', 'abductors'].includes(ex.primaryMuscle)
            ? s.barbellLower
            : s.barbellUpper;
        case 'dumbbell':
          return s.dumbbell;
        case 'machine':
          return s.machine;
        case 'cable':
          return s.cable;
        case 'kettlebell':
          return s.kettlebell;
        case 'bodyweight':
          return s.bodyweight;
        default:
          return s.other;
      }
    },
  );
}

export function safeSuggest(
  ex: Exercise,
  prescription: Prescription,
  history: ExerciseHistoryEntry[],
  profile: EquipmentProfile,
): Suggestion | null {
  return attempt<Suggestion | null>(
    () => suggestNext(ex, prescription, history, profile, new Date()),
    () => {
      const last = history[0];
      const working = last?.sets.filter((s) => s.type === 'working') ?? [];
      if (!last || !working.length) {
        return {
          kind: 'first_time',
          weight: null,
          reps: prescription.repMin,
          sets: prescription.sets,
          reason: 'Första gången – välj en startvikt',
          readyToIncrease: false,
          plateau: false,
        };
      }
      return {
        kind: 'none',
        weight: Math.max(...working.map((s) => s.weight)),
        reps: prescription.repMin,
        sets: prescription.sets,
        reason: 'Samma vikt som förra gången',
        readyToIncrease: false,
        plateau: false,
      };
    },
  );
}

function localNext(se: SessionExercise, sets: SetEntry[]): NextSet | null {
  const done = sets.filter((s) => s.sessionExerciseId === se.id).length;
  const total = se.warmupSets + se.sets;
  if (done >= total) return null;
  const isWarmup = done < se.warmupSets;
  const w = se.suggestion?.weight ?? null;
  return {
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    setNumber: done + 1,
    totalSets: total,
    type: isWarmup ? 'warmup' : 'working',
    reps: isWarmup ? Math.max(se.repMin, 8) : (se.suggestion?.reps ?? se.repMin),
    weight: w == null ? null : isWarmup ? Math.round((w * 0.5) / 2.5) * 2.5 : w,
    restSec: se.restSec,
  };
}

/** Next set for the whole session (engine order). */
export function safeNextSet(session: WorkoutSession, sets: SetEntry[]): NextSet | null {
  return attempt<NextSet | null>(
    () => nextSetInSession(session, sets),
    () => {
      for (const se of session.exercises) {
        const n = localNext(se, sets);
        if (n) return n;
      }
      return null;
    },
  );
}

/** Next set restricted to one session exercise (for logging out of order). */
export function safeNextSetFor(session: WorkoutSession, sets: SetEntry[], seId: string): NextSet | null {
  const se = session.exercises.find((e) => e.id === seId);
  if (!se) return null;
  const own = sets.filter((s) => s.sessionExerciseId === seId);
  return attempt<NextSet | null>(
    () => nextSetInSession({ ...session, exercises: [se] }, own),
    () => localNext(se, own),
  );
}

export function safeSummary(session: WorkoutSession, sets: SetEntry[]): SessionSummary {
  const end = session.endedAt ? new Date(session.endedAt) : new Date();
  return attempt(
    () => summarizeSession(session, sets, end),
    () => {
      const counted = sets.filter((s) => s.type !== 'warmup');
      return {
        durationSec: Math.max(0, (end.getTime() - new Date(session.startedAt).getTime()) / 1000),
        setCount: counted.length,
        volumeKg: counted.reduce((a, s) => a + s.weight * s.reps, 0),
      };
    },
  );
}

type Lite = Pick<SetEntry, 'type' | 'reps' | 'weight'>;
export function safeNewRecords(prior: Lite[], current: Lite[]): { heaviest: boolean; best1RM: boolean; repsAtWeight: number[] } {
  return attempt(
    () => newRecords(prior, current),
    () => {
      const p = prior.filter((s) => s.type !== 'warmup' && s.reps > 0);
      const c = current.filter((s) => s.type !== 'warmup' && s.reps > 0);
      if (!c.length) return { heaviest: false, best1RM: false, repsAtWeight: [] };
      const e1 = (s: Lite) => (s.reps <= 1 ? s.weight : s.weight * (1 + s.reps / 30));
      const maxW = (l: Lite[]) => Math.max(-Infinity, ...l.map((s) => s.weight));
      const max1 = (l: Lite[]) => Math.max(-Infinity, ...l.map(e1));
      const repsAt: number[] = [];
      if (p.length) {
        for (const w of new Set(c.map((s) => s.weight))) {
          const prev = p.filter((s) => s.weight === w);
          if (!prev.length) continue;
          const best = Math.max(...c.filter((s) => s.weight === w).map((s) => s.reps));
          if (best > Math.max(...prev.map((s) => s.reps))) repsAt.push(w);
        }
      }
      return {
        heaviest: p.length > 0 && maxW(c) > maxW(p),
        best1RM: p.length > 0 && max1(c) > max1(p),
        repsAtWeight: repsAt,
      };
    },
  );
}

export function safePlates(target: number, bar: number, plates: number[]): PlateResult {
  return attempt(
    () => platesPerSide(target, bar, plates),
    () => {
      const sorted = [...plates].sort((a, b) => b - a);
      let side = Math.max(0, (target - bar) / 2);
      const perSide: number[] = [];
      for (const p of sorted) {
        while (side + 1e-9 >= p) {
          perSide.push(p);
          side -= p;
        }
      }
      const achieved = bar + 2 * perSide.reduce((a, b) => a + b, 0);
      return { perSide, achievedTotal: achieved, remainder: Math.max(0, target - achieved) };
    },
  );
}

export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export type { Settings };
