// Pure statistics aggregation. No React/Dexie imports so it can be unit tested in node.
// All weights are kg. "Working set" in this module = every set that is not a warmup
// (working, drop and failure sets all count), matching the engine's volume definition.
//
// Muscle-group volume convention: a working set counts 1 for the exercise's primary muscle
// and 0.5 for each secondary muscle (a common hypertrophy-research convention for
// "fractional sets"). Totals can therefore be halves, e.g. 7,5 set.
import type { Exercise, MuscleGroup, SetEntry, WorkoutSession } from '@/engine/types.ts';

type SetLike = Pick<SetEntry, 'sessionId' | 'exerciseId' | 'type' | 'reps' | 'weight' | 'durationSec' | 'order'>;
type SessionLike = Pick<WorkoutSession, 'id' | 'name' | 'status' | 'startedAt'>;

/** Epley 1RM: weight × (1 + reps / 30); reps <= 1 returns the weight. Local copy so stats don't depend on the engine. */
export function epley(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

export const isWorking = (s: Pick<SetEntry, 'type'>) => s.type !== 'warmup';

// ---------- Weeks (Monday first, ISO 8601 numbering, local time) ----------

/** Local midnight of the Monday starting the week that contains `d`. */
export function startOfWeek(d: Date | string): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() - day);
}

export function addWeeks(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
}

/** ISO week number and ISO week-year. */
export function isoWeek(d: Date | string): { year: number; week: number } {
  const x = new Date(d);
  // Thursday of this week decides the year.
  const thursday = new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7) + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week1Monday = startOfWeek(jan4);
  const week = 1 + Math.round((startOfWeek(thursday).getTime() - week1Monday.getTime()) / (7 * 86400000));
  return { year, week };
}

/** "v. 43" */
export function weekLabel(d: Date | string): string {
  return `v. ${isoWeek(d).week}`;
}

/** Stable key "2026-W43". */
export function weekKey(d: Date | string): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ---------- Helpers ----------

function completedById(sessions: SessionLike[]): Map<string, SessionLike> {
  return new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
}

const weightKey = (w: number) => String(Math.round(w * 100) / 100);

// ---------- Sessions per week ----------

export interface WeekCount {
  weekStart: Date;
  label: string; // "v. 43"
  key: string;
  count: number;
}

/** Completed sessions per week for the `weeks` weeks ending with the week of `now` (oldest first). */
export function sessionsPerWeek(sessions: SessionLike[], weeks: number, now: Date): WeekCount[] {
  const current = startOfWeek(now);
  const out: WeekCount[] = [];
  const idx = new Map<string, WeekCount>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addWeeks(current, -i);
    const w: WeekCount = { weekStart: ws, label: weekLabel(ws), key: weekKey(ws), count: 0 };
    out.push(w);
    idx.set(w.key, w);
  }
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const w = idx.get(weekKey(s.startedAt));
    if (w) w.count++;
  }
  return out;
}

// ---------- Working sets per muscle group ----------

export interface MuscleCount {
  muscle: MuscleGroup;
  sets: number;
}

/**
 * Working sets per muscle group during the week starting `weekStart` (a Monday).
 * Primary muscle counts 1, each secondary muscle 0.5. Sorted by sets, descending.
 */
export function muscleSetsForWeek(
  sets: SetLike[],
  sessions: SessionLike[],
  exercises: Map<string, Pick<Exercise, 'primaryMuscle' | 'secondaryMuscles'>>,
  weekStart: Date,
): MuscleCount[] {
  const key = weekKey(weekStart);
  const byId = completedById(sessions);
  const totals = new Map<MuscleGroup, number>();
  const add = (m: MuscleGroup, n: number) => totals.set(m, (totals.get(m) ?? 0) + n);
  for (const s of sets) {
    if (!isWorking(s)) continue;
    const session = byId.get(s.sessionId);
    if (!session || weekKey(session.startedAt) !== key) continue;
    const ex = exercises.get(s.exerciseId);
    if (!ex) continue;
    add(ex.primaryMuscle, 1);
    for (const m of ex.secondaryMuscles) if (m !== ex.primaryMuscle) add(m, 0.5);
  }
  return [...totals.entries()].map(([muscle, n]) => ({ muscle, sets: n })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

// ---------- Per exercise ----------

export interface ExercisePoint {
  sessionId: string;
  sessionName: string;
  date: string; // ISO session start
  /** Heaviest non-warmup weight (kg). */
  heaviest: number;
  /** Best Epley 1RM among non-warmup sets (kg). */
  best1RM: number;
  /** Σ weight × reps of non-warmup sets (kg). */
  volume: number;
  workingSets: number;
  totalReps: number;
  /** Longest non-warmup duration (time exercises), seconds. */
  longestSec: number;
  /** All sets for the exercise in that session (incl. warmups), ordered. */
  sets: SetLike[];
}

/** One point per completed session in which the exercise was performed, oldest first. */
export function exerciseSeries(sets: SetLike[], sessions: SessionLike[], exerciseId: string): ExercisePoint[] {
  const byId = completedById(sessions);
  const groups = new Map<string, SetLike[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !byId.has(s.sessionId)) continue;
    const list = groups.get(s.sessionId) ?? [];
    list.push(s);
    groups.set(s.sessionId, list);
  }
  const points: ExercisePoint[] = [];
  for (const [sessionId, list] of groups) {
    const session = byId.get(sessionId)!;
    list.sort((a, b) => a.order - b.order);
    const p: ExercisePoint = {
      sessionId,
      sessionName: session.name,
      date: session.startedAt,
      heaviest: 0,
      best1RM: 0,
      volume: 0,
      workingSets: 0,
      totalReps: 0,
      longestSec: 0,
      sets: list,
    };
    for (const s of list) {
      if (!isWorking(s)) continue;
      p.workingSets++;
      p.totalReps += s.reps;
      p.heaviest = Math.max(p.heaviest, s.weight);
      p.best1RM = Math.max(p.best1RM, epley(s.weight, s.reps));
      p.volume += s.weight * s.reps;
      p.longestSec = Math.max(p.longestSec, s.durationSec ?? 0);
    }
    points.push(p);
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface RepsAtWeight {
  weight: number;
  reps: number;
  date: string;
}

export interface ExerciseRecords {
  heaviest: { weight: number; reps: number; date: string } | null;
  best1RM: { value: number; weight: number; reps: number; date: string } | null;
  mostReps: { reps: number; weight: number; date: string } | null;
  /** Most reps performed at each weight, heaviest weight first. */
  repsAtWeight: RepsAtWeight[];
}

/** Personal records from a series (non-warmup sets only). Ties keep the earliest date. */
export function exerciseRecords(points: ExercisePoint[]): ExerciseRecords {
  const r: ExerciseRecords = { heaviest: null, best1RM: null, mostReps: null, repsAtWeight: [] };
  const atWeight = new Map<string, RepsAtWeight>();
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  for (const p of ordered) {
    for (const s of p.sets) {
      if (!isWorking(s) || s.reps <= 0) continue;
      if (s.weight > 0 && (!r.heaviest || s.weight > r.heaviest.weight || (s.weight === r.heaviest.weight && s.reps > r.heaviest.reps)))
        r.heaviest = { weight: s.weight, reps: s.reps, date: p.date };
      const e = epley(s.weight, s.reps);
      if (e > 0 && (!r.best1RM || e > r.best1RM.value + 1e-9)) r.best1RM = { value: e, weight: s.weight, reps: s.reps, date: p.date };
      if (!r.mostReps || s.reps > r.mostReps.reps) r.mostReps = { reps: s.reps, weight: s.weight, date: p.date };
      const k = weightKey(s.weight);
      const cur = atWeight.get(k);
      if (!cur || s.reps > cur.reps) atWeight.set(k, { weight: Math.round(s.weight * 100) / 100, reps: s.reps, date: p.date });
    }
  }
  r.repsAtWeight = [...atWeight.values()].sort((a, b) => b.weight - a.weight);
  return r;
}

export interface TrainedExercise {
  exerciseId: string;
  lastDate: string;
  sessionCount: number;
}

/** Exercises with at least one set in a completed session, most recently trained first. */
export function trainedExercises(sets: SetLike[], sessions: SessionLike[]): TrainedExercise[] {
  const byId = completedById(sessions);
  const map = new Map<string, { last: string; sessions: Set<string> }>();
  for (const s of sets) {
    const session = byId.get(s.sessionId);
    if (!session) continue;
    const cur = map.get(s.exerciseId) ?? { last: '', sessions: new Set<string>() };
    if (session.startedAt > cur.last) cur.last = session.startedAt;
    cur.sessions.add(session.id);
    map.set(s.exerciseId, cur);
  }
  return [...map.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, lastDate: v.last, sessionCount: v.sessions.size }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
