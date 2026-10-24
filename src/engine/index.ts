// Public API of the progression engine. Pure functions only.
// STUBS – implemented by the engine module files. Signatures are a contract used by the UI
// and by supabase/functions/_shared/engine (a copy made by `npm run engine:sync`).
import type {
  Equipment,
  EquipmentProfile,
  Exercise,
  ExerciseHistoryEntry,
  MuscleGroup,
  NextSet,
  Prescription,
  Program,
  SetEntry,
  Suggestion,
  Unit,
  WorkoutSession,
  WorkoutTemplate,
} from './types.ts';

export * from './types.ts';

const todo = (): never => {
  throw new Error('not implemented');
};

/** Muscle groups counted as lower body (for default barbell step). */
export function isLowerBody(_muscle: MuscleGroup): boolean {
  return todo();
}

/** Effective weight step in kg for an exercise (custom step or default from profile). */
export function weightStepFor(_ex: Exercise, _profile: EquipmentProfile): number {
  return todo();
}

/** Round to the nearest weight that can actually be loaded with the user's equipment. */
export function roundToAvailable(_weightKg: number, _ex: Pick<Exercise, 'equipment' | 'weightStep' | 'primaryMuscle' | 'measure'>, _profile: EquipmentProfile): number {
  return todo();
}

/** Main entry: suggestion for next session for one exercise. history newest first. */
export function suggestNext(
  _ex: Exercise,
  _prescription: Prescription,
  _history: ExerciseHistoryEntry[],
  _profile: EquipmentProfile,
  _now: Date,
): Suggestion {
  return todo();
}

/** Epley: weight × (1 + reps / 30). reps <= 1 returns weight. */
export function epley1RM(_weight: number, _reps: number): number {
  return todo();
}

/** Plates per side for a barbell target. */
export interface PlateResult {
  perSide: number[]; // largest first
  achievedTotal: number;
  remainder: number; // target - achieved (>= 0)
}
export function platesPerSide(_targetKg: number, _barWeight: number, _plates: number[]): PlateResult {
  return todo();
}

/** True if estimated 1RM has not increased during the last 4 weeks (needs ≥ 4 weeks of data). */
export function isPlateau(_history: ExerciseHistoryEntry[], _now: Date): boolean {
  return todo();
}

/** Next set to perform in an active session, or null when every prescribed set is done. */
export function nextSetInSession(_session: WorkoutSession, _sets: SetEntry[]): NextSet | null {
  return todo();
}

export interface SessionSummary {
  durationSec: number;
  setCount: number; // working + drop + failure (not warmup)
  volumeKg: number; // Σ weight × reps (non-warmup)
}
export function summarizeSession(_session: WorkoutSession, _sets: SetEntry[], _now: Date): SessionSummary {
  return todo();
}

export interface PersonalRecords {
  heaviestWeight: number | null;
  best1RM: number | null;
  /** weight (kg) -> max reps on that weight */
  mostRepsAtWeight: Record<string, number>;
}
export function personalRecords(_sets: Pick<SetEntry, 'type' | 'reps' | 'weight'>[]): PersonalRecords {
  return todo();
}
/** Which PR categories a session's sets beat vs. prior history. Swedish labels, e.g. "Bänkpress: nytt 1RM 102,3 kg". */
export function newRecords(_prior: Pick<SetEntry, 'type' | 'reps' | 'weight'>[], _current: Pick<SetEntry, 'type' | 'reps' | 'weight'>[]): { heaviest: boolean; best1RM: boolean; repsAtWeight: number[] } {
  return todo();
}

/** Swedish formatting: 82.5 -> "82,5 kg"; converts to lb when unit = 'lb'. */
export function formatWeight(_kg: number, _unit: Unit, _opts?: { withUnit?: boolean }): string {
  return todo();
}
export function kgToUnit(_kg: number, _unit: Unit): number {
  return todo();
}
export function unitToKg(_value: number, _unit: Unit): number {
  return todo();
}

/** Default equipment step lookup. */
export function defaultStepFor(_equipment: Equipment, _lower: boolean, _profile: EquipmentProfile): number {
  return todo();
}

/**
 * Which template the program schedules for `date`.
 * weekdays: template for that weekday (null = vilodag).
 * rotation: template after the most recently completed session belonging to this program
 * (first in rotation if none); always a training day.
 * `completed` = completed sessions (any order).
 */
export function scheduledTemplateId(
  _program: Program,
  _completed: Pick<WorkoutSession, 'programId' | 'templateId' | 'startedAt' | 'status'>[],
  _date: Date,
): string | null {
  return todo();
}

/** Upcoming schedule: next `count` training days from `from` (inclusive) as { date, templateId }. */
export function upcomingSchedule(
  _program: Program,
  _completed: Pick<WorkoutSession, 'programId' | 'templateId' | 'startedAt' | 'status'>[],
  _from: Date,
  _count: number,
): { date: Date; templateId: string }[] {
  return todo();
}

/** Rough duration estimate in minutes for a template (sets × (work ~45 s + rest)). */
export function estimateMinutes(_template: Pick<WorkoutTemplate, 'exercises'>): number {
  return todo();
}

/**
 * Build a new active session from a template, attaching a suggestion per exercise.
 * `histories` maps exerciseId → history (newest first). Unknown exercises are skipped.
 */
export function buildSession(args: {
  id: string;
  newId: () => string;
  template: WorkoutTemplate | null;
  programId: string | null;
  exercises: Map<string, Exercise>;
  histories: Map<string, ExerciseHistoryEntry[]>;
  profile: EquipmentProfile;
  now: Date;
}): WorkoutSession {
  void args;
  return todo();
}
