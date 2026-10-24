// Building sessions, finding the next set and summarising a finished session.
import type {
  EquipmentProfile,
  Exercise,
  ExerciseHistoryEntry,
  NextSet,
  SessionExercise,
  SetEntry,
  WorkoutSession,
  WorkoutTemplate,
} from './types.ts';
import { suggestNext } from './progression.ts';
import { roundToAvailable } from './rounding.ts';

export const EMPTY_SESSION_NAME = 'Tomt pass';
export const WARMUP_REPS = 8;
export const WARMUP_FACTOR = 0.5;

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
  const { template, exercises, histories, profile, now } = args;
  const sessionExercises: SessionExercise[] = [];
  for (const te of template?.exercises ?? []) {
    const ex = exercises.get(te.exerciseId);
    if (!ex) continue;
    const prescription = {
      sets: te.sets,
      repMin: te.repMin,
      repMax: te.repMax,
      targetRpe: te.targetRpe,
      restSec: te.restSec,
      warmupSets: te.warmupSets,
      rule: te.rule,
    };
    sessionExercises.push({
      id: args.newId(),
      exerciseId: te.exerciseId,
      supersetGroup: te.supersetGroup,
      notes: te.notes,
      ...prescription,
      suggestion: suggestNext(ex, prescription, histories.get(ex.id) ?? [], profile, now),
    });
  }
  return {
    id: args.id,
    name: template?.name ?? EMPTY_SESSION_NAME,
    templateId: template?.id ?? null,
    programId: args.programId,
    status: 'active',
    startedAt: now.toISOString(),
    endedAt: null,
    notes: '',
    exercises: sessionExercises,
  };
}

interface Progress {
  se: SessionExercise;
  warmupsDone: number;
  workingDone: number;
  /** Warmups are considered done once any working set is logged. */
  warmupsNeeded: number;
  done: number;
  total: number;
  lastWarmup: SetEntry | null;
  lastWorking: SetEntry | null;
}

function progressOf(se: SessionExercise, sets: SetEntry[]): Progress {
  const mine = sets
    .filter((s) => s.sessionExerciseId === se.id)
    .sort((a, b) => a.order - b.order || Date.parse(a.completedAt) - Date.parse(b.completedAt));
  let warmupsDone = 0;
  let workingDone = 0;
  let lastWarmup: SetEntry | null = null;
  let lastWorking: SetEntry | null = null;
  for (const s of mine) {
    if (s.type === 'warmup') {
      warmupsDone++;
      lastWarmup = s;
    } else {
      workingDone++;
      lastWorking = s;
    }
  }
  const warmupSets = Math.max(0, se.warmupSets);
  const warmupsNeeded = workingDone > 0 ? 0 : Math.max(0, warmupSets - warmupsDone);
  const workingLeft = Math.max(0, se.sets - workingDone);
  const total = warmupSets + Math.max(0, se.sets);
  return {
    se,
    warmupsDone,
    workingDone,
    warmupsNeeded,
    done: total - warmupsNeeded - workingLeft,
    total,
    lastWarmup,
    lastWorking,
  };
}

const incomplete = (p: Progress): boolean => p.warmupsNeeded > 0 || p.workingDone < p.se.sets;

/**
 * Next set to perform in an active session, or null when every prescribed set is done.
 * Exercises are visited in order; consecutive exercises sharing a supersetGroup alternate
 * (A1 set 1, A2 set 1, A1 set 2 …). Warmups come first (≈ 50 % of working weight, 8 reps)
 * and are skipped once a working set is logged. drop/failure sets count as working sets.
 * Pass `opts` to round warmup weights to the user's equipment (otherwise nearest 2,5 kg).
 */
export function nextSetInSession(
  session: WorkoutSession,
  sets: SetEntry[],
  opts?: { exercises?: Map<string, Exercise>; profile?: EquipmentProfile },
): NextSet | null {
  const exs = session.exercises;
  let i = 0;
  while (i < exs.length) {
    const group = exs[i].supersetGroup;
    let j = i + 1;
    if (group !== null) while (j < exs.length && exs[j].supersetGroup === group) j++;
    const block = exs.slice(i, j).map((se) => progressOf(se, sets));
    let pick: Progress | null = null;
    for (const p of block) {
      if (!incomplete(p)) continue;
      if (!pick || p.done < pick.done) pick = p;
    }
    if (pick) return describe(pick, opts);
    i = j;
  }
  return null;
}

function describe(p: Progress, opts?: { exercises?: Map<string, Exercise>; profile?: EquipmentProfile }): NextSet {
  const { se } = p;
  const sug = se.suggestion;
  const workingWeight = p.lastWorking ? p.lastWorking.weight : (sug?.weight ?? null);
  const workingReps = p.lastWorking ? p.lastWorking.reps : (sug?.reps ?? se.repMin);
  const base = {
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    totalSets: p.total,
    restSec: se.restSec,
  };
  if (p.warmupsNeeded > 0) {
    let weight: number | null;
    let reps = WARMUP_REPS;
    if (p.lastWarmup) {
      weight = p.lastWarmup.weight;
      reps = p.lastWarmup.reps;
    } else if (workingWeight === null) {
      weight = null;
    } else {
      const ex = opts?.exercises?.get(se.exerciseId);
      const raw = workingWeight * WARMUP_FACTOR;
      weight = ex && opts?.profile ? roundToAvailable(raw, ex, opts.profile) : Math.round(raw / 2.5) * 2.5;
    }
    return { ...base, setNumber: p.warmupsDone + 1, type: 'warmup', reps, weight };
  }
  return {
    ...base,
    setNumber: Math.max(0, se.warmupSets) + p.workingDone + 1,
    type: 'working',
    reps: workingReps,
    weight: workingWeight,
  };
}

export interface SessionSummary {
  durationSec: number;
  setCount: number; // working + drop + failure (not warmup)
  volumeKg: number; // Σ weight × reps (non-warmup)
}

/** Summary of a session: duration (to endedAt, or `now` while active), non-warmup set count and volume. */
export function summarizeSession(session: WorkoutSession, sets: SetEntry[], now: Date): SessionSummary {
  const start = Date.parse(session.startedAt);
  const end = session.endedAt ? Date.parse(session.endedAt) : now.getTime();
  const durationSec = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0;
  let setCount = 0;
  let volume = 0;
  for (const s of sets) {
    if (s.sessionId !== session.id || s.type === 'warmup') continue;
    setCount++;
    volume += Math.max(0, s.weight) * Math.max(0, s.reps);
  }
  return { durationSec, setCount, volumeKg: Math.round(volume * 1000) / 1000 };
}
