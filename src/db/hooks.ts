import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_SETTINGS, getActiveSession, getSessionSets, getSettings, strip } from './repo';
import type { Exercise, Program, SetEntry, Settings, WorkoutSession, WorkoutTemplate } from '@/engine';

/** Live list of non-deleted exercises sorted by Swedish name. */
export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(async () => {
    const rows = (await db.exercises.toArray()).filter((r) => !r._deleted).map((r) => strip(r));
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  });
}

/** Map id → exercise (includes nothing deleted). */
export function useExerciseMap(): Map<string, Exercise> | undefined {
  const list = useExercises();
  return list && new Map(list.map((e) => [e.id, e]));
}

export function useTemplates(): WorkoutTemplate[] | undefined {
  return useLiveQuery(async () =>
    (await db.templates.toArray())
      .filter((r) => !r._deleted)
      .map((r) => strip(r))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  );
}

export function usePrograms(): Program[] | undefined {
  return useLiveQuery(async () => (await db.programs.toArray()).filter((r) => !r._deleted).map((r) => strip(r)));
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings) ?? DEFAULT_SETTINGS;
}

/** undefined while loading, null when no active session. */
export function useActiveSession(): WorkoutSession | null | undefined {
  return useLiveQuery(async () => (await getActiveSession()) ?? null);
}

export function useSession(id: string | undefined): WorkoutSession | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const r = await db.sessions.get(id);
    return r && !r._deleted ? strip(r) : null;
  }, [id]);
}

export function useSessionSets(sessionId: string | undefined): SetEntry[] | undefined {
  return useLiveQuery(async () => (sessionId ? getSessionSets(sessionId) : []), [sessionId]);
}

/** Completed sessions, newest first. */
export function useCompletedSessions(): WorkoutSession[] | undefined {
  return useLiveQuery(async () => {
    const rows = (await db.sessions.where('status').equals('completed').toArray()).filter((r) => !r._deleted);
    return rows.map((r) => strip(r)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  });
}

/** All non-deleted sets (for statistics). */
export function useAllSets(): SetEntry[] | undefined {
  return useLiveQuery(async () => (await db.sets.toArray()).filter((r) => !r._deleted).map((r) => strip(r)));
}
