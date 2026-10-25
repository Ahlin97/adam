// Session lifecycle and mutations. Everything is written to IndexedDB immediately so an
// active session survives reloads and crashes; the UI derives its state from the DB.
import { buildSession, type Exercise, type ExerciseHistoryEntry, type Prescription, type SessionExercise, type SetEntry, type SetType, type WorkoutSession } from '@/engine';
import { db } from '@/db/db';
import { all, get, getActiveSession, getExerciseHistory, getSessionSets, getSettings, newId, put, remove } from '@/db/repo';
import { safeSuggest } from './safeEngine';
import { requestNotificationPermission, unlockAudio } from './alerts';
import { clearRest } from './restTimer';

/**
 * Start a new session from a template (or empty when templateId is null).
 * Returns the id of the already active session if there is one.
 * Call from a click handler: it also unlocks audio and asks for notification permission.
 */
export async function startSession(opts: { templateId: string | null; programId: string | null }): Promise<string> {
  // Must happen synchronously inside the user gesture.
  unlockAudio();
  requestNotificationPermission();

  const active = await getActiveSession();
  if (active) return active.id;

  const settings = await getSettings();
  const template = opts.templateId ? ((await get('templates', opts.templateId)) ?? null) : null;
  const exerciseList = await all('exercises');
  const exercises = new Map(exerciseList.map((e) => [e.id, e]));
  const histories = new Map<string, ExerciseHistoryEntry[]>();
  for (const te of template?.exercises ?? []) {
    if (!histories.has(te.exerciseId)) histories.set(te.exerciseId, await getExerciseHistory(te.exerciseId));
  }
  const id = newId();
  const now = new Date();

  let session: WorkoutSession;
  try {
    session = buildSession({ id, newId, template, programId: opts.programId, exercises, histories, profile: settings, now });
    if (!session || !Array.isArray(session.exercises)) throw new Error('bad session');
  } catch {
    session = {
      id,
      name: template?.name ?? 'Fritt pass',
      templateId: template?.id ?? null,
      programId: opts.programId,
      status: 'active',
      startedAt: now.toISOString(),
      endedAt: null,
      notes: '',
      exercises: (template?.exercises ?? [])
        .filter((te) => exercises.has(te.exerciseId))
        .map((te) => {
          const { id: _tid, ...rest } = te;
          void _tid;
          return {
            ...rest,
            id: newId(),
            suggestion: safeSuggest(exercises.get(te.exerciseId)!, te, histories.get(te.exerciseId) ?? [], settings),
          };
        }),
    };
  }
  if (!template && session.name === '') session.name = 'Fritt pass';
  await put('sessions', session);
  await clearRest();
  return id;
}

async function mutateSession(sessionId: string, fn: (s: WorkoutSession) => WorkoutSession | void): Promise<WorkoutSession | undefined> {
  const s = await get('sessions', sessionId);
  if (!s) return undefined;
  const draft = structuredClone(s);
  const next = fn(draft) ?? draft;
  await put('sessions', next);
  return next;
}

async function defaultPrescription(exercise: Exercise, history: ExerciseHistoryEntry[]): Promise<Prescription> {
  const settings = await getSettings();
  const last = history[0]?.prescription;
  if (last) return { ...last };
  const time = exercise.measure === 'time';
  return {
    sets: 3,
    repMin: time ? 30 : 8,
    repMax: time ? 60 : 12,
    targetRpe: null,
    restSec: settings.defaultRestSec,
    warmupSets: 0,
    rule: settings.defaultRule,
  };
}

async function makeSessionExercise(sessionId: string, exercise: Exercise, base?: Partial<SessionExercise>): Promise<SessionExercise> {
  const settings = await getSettings();
  const history = await getExerciseHistory(exercise.id, sessionId);
  const prescription: Prescription = base
    ? {
        sets: base.sets ?? 3,
        repMin: base.repMin ?? 8,
        repMax: base.repMax ?? 12,
        targetRpe: base.targetRpe ?? null,
        restSec: base.restSec ?? settings.defaultRestSec,
        warmupSets: base.warmupSets ?? 0,
        rule: base.rule ?? settings.defaultRule,
      }
    : await defaultPrescription(exercise, history);
  return {
    ...prescription,
    id: newId(),
    exerciseId: exercise.id,
    supersetGroup: base?.supersetGroup ?? null,
    notes: '',
    suggestion: safeSuggest(exercise, prescription, history, settings),
  };
}

/** Append an exercise to the session. Returns the new SessionExercise id. */
export async function addExerciseToSession(sessionId: string, exercise: Exercise): Promise<string> {
  const se = await makeSessionExercise(sessionId, exercise);
  await mutateSession(sessionId, (s) => {
    s.exercises.push(se);
  });
  return se.id;
}

/**
 * Swap an exercise for another one keeping the prescription. Once anything was logged for the old
 * exercise you are warm, so the new one gets no warm-up sets. If only warm-ups were logged they are
 * dropped together with the old exercise (warm-ups never count in volume or records); if working
 * sets were logged the old exercise is kept (trimmed to those sets) and the new one inserted after it.
 * Returns the new SessionExercise id.
 */
export async function replaceExercise(sessionId: string, sessionExerciseId: string, exercise: Exercise): Promise<string | null> {
  const session = await get('sessions', sessionId);
  const old = session?.exercises.find((e) => e.id === sessionExerciseId);
  if (!session || !old) return null;
  const logged = (await getSessionSets(sessionId)).filter((s) => s.sessionExerciseId === sessionExerciseId);
  const onlyWarmups = logged.length > 0 && logged.every((x) => x.type === 'warmup');
  const se = await makeSessionExercise(sessionId, exercise, logged.length ? { ...old, warmupSets: 0 } : old);
  if (onlyWarmups) for (const x of logged) await remove('sets', x.id);
  await mutateSession(sessionId, (s) => {
    const idx = s.exercises.findIndex((e) => e.id === sessionExerciseId);
    if (idx < 0) return;
    if (logged.length === 0 || onlyWarmups) {
      s.exercises[idx] = se;
    } else {
      const prev = s.exercises[idx];
      const warm = logged.filter((x) => x.type === 'warmup').length;
      s.exercises[idx] = { ...prev, warmupSets: Math.min(prev.warmupSets, warm), sets: Math.max(0, logged.length - Math.min(prev.warmupSets, warm)) };
      s.exercises.splice(idx + 1, 0, se);
    }
  });
  return se.id;
}

export async function moveExercise(sessionId: string, sessionExerciseId: string, delta: -1 | 1): Promise<void> {
  await mutateSession(sessionId, (s) => {
    const i = s.exercises.findIndex((e) => e.id === sessionExerciseId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= s.exercises.length) return;
    [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]];
  });
}

/** Remove an exercise and soft-delete its logged sets. */
export async function removeExercise(sessionId: string, sessionExerciseId: string): Promise<void> {
  const sets = (await getSessionSets(sessionId)).filter((s) => s.sessionExerciseId === sessionExerciseId);
  for (const s of sets) await remove('sets', s.id);
  await mutateSession(sessionId, (s) => {
    s.exercises = s.exercises.filter((e) => e.id !== sessionExerciseId);
  });
}

/** Add one more planned (working) set to an exercise. */
export async function addPlannedSet(sessionId: string, sessionExerciseId: string): Promise<void> {
  await mutateSession(sessionId, (s) => {
    const e = s.exercises.find((x) => x.id === sessionExerciseId);
    if (e) e.sets += 1;
  });
}

/** Remove one planned working set (never below the number already logged). */
export async function removePlannedSet(sessionId: string, sessionExerciseId: string): Promise<void> {
  const logged = (await getSessionSets(sessionId)).filter((s) => s.sessionExerciseId === sessionExerciseId).length;
  await mutateSession(sessionId, (s) => {
    const e = s.exercises.find((x) => x.id === sessionExerciseId);
    if (e && e.sets > 0 && e.warmupSets + e.sets - 1 >= logged) e.sets -= 1;
  });
}

export async function updateSessionExercise(sessionId: string, sessionExerciseId: string, patch: Partial<SessionExercise>): Promise<void> {
  await mutateSession(sessionId, (s) => {
    const e = s.exercises.find((x) => x.id === sessionExerciseId);
    if (e) Object.assign(e, patch);
  });
}

export async function updateSession(sessionId: string, patch: Partial<Omit<WorkoutSession, 'id'>>): Promise<void> {
  await mutateSession(sessionId, (s) => ({ ...s, ...patch }));
}

export interface LogSetInput {
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  type: SetType;
  reps: number;
  /** kg */
  weight: number;
  durationSec: number | null;
  rpe: number | null;
  /** ISO; defaults to now. */
  completedAt?: string;
}

/** Write a set to the DB immediately. Returns the stored entry. */
export async function logSet(input: LogSetInput): Promise<SetEntry> {
  const existing = await db.sets.where('sessionId').equals(input.sessionId).toArray();
  const order = existing.filter((s) => s.sessionExerciseId === input.sessionExerciseId).reduce((m, s) => Math.max(m, s.order), -1) + 1;
  const entry: SetEntry = {
    id: newId(),
    sessionId: input.sessionId,
    sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId,
    order,
    type: input.type,
    reps: input.reps,
    weight: input.weight,
    durationSec: input.durationSec,
    rpe: input.rpe,
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
  await put('sets', entry);
  return entry;
}

export async function updateSet(set: SetEntry): Promise<void> {
  await put('sets', set);
}

export async function deleteSet(id: string): Promise<void> {
  await remove('sets', id);
}

/** Mark the session completed. Exercises without any logged set are dropped. */
export async function finishSession(id: string): Promise<void> {
  const sets = await getSessionSets(id);
  const used = new Set(sets.map((s) => s.sessionExerciseId));
  await mutateSession(id, (s) => {
    s.status = 'completed';
    s.endedAt = new Date().toISOString();
    if (sets.length) s.exercises = s.exercises.filter((e) => used.has(e.id));
  });
  await clearRest();
}

/** Soft-delete a session and all its sets (used for discarding an active one and deleting from history). */
export async function deleteSession(id: string): Promise<void> {
  const sets = await getSessionSets(id);
  for (const s of sets) await remove('sets', s.id);
  await remove('sessions', id);
}

export async function discardSession(id: string): Promise<void> {
  await deleteSession(id);
  await clearRest();
}
