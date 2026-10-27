import { db, type Row, type SyncedTable } from './db';
import type {
  Exercise,
  ExerciseHistoryEntry,
  Program,
  SetEntry,
  Settings,
  WorkoutSession,
  WorkoutTemplate,
} from '@/engine';

type EntityMap = {
  exercises: Exercise;
  templates: WorkoutTemplate;
  programs: Program;
  sessions: WorkoutSession;
  sets: SetEntry;
  settings: Settings;
};

/** Random id usable as primary key (also for builtin-style text ids). */
export function newId(): string {
  return crypto.randomUUID();
}

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();
/** The sync engine subscribes here to push soon after local writes. */
export function onLocalChange(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitChange() {
  for (const fn of listeners) fn();
}

function strip<T extends object>(row: Row<T>): T {
  const { _dirty: _d, _deleted: _x, ...rest } = row;
  return rest as unknown as T;
}

/** Insert or replace an entity locally and mark it for sync. */
export async function put<K extends SyncedTable>(table: K, value: EntityMap[K]): Promise<void> {
  const row = { ...value, _dirty: 1, _deleted: 0 } as Row<EntityMap[K]>;
  await (db[table] as unknown as import('dexie').Table<Row<EntityMap[K]>, string>).put(row);
  emitChange();
}

export async function putMany<K extends SyncedTable>(table: K, values: EntityMap[K][]): Promise<void> {
  if (!values.length) return;
  const rows = values.map((v) => ({ ...v, _dirty: 1, _deleted: 0 })) as Row<EntityMap[K]>[];
  await (db[table] as unknown as import('dexie').Table<Row<EntityMap[K]>, string>).bulkPut(rows);
  emitChange();
}

/** Soft delete (synced as deleted). */
export async function remove(table: SyncedTable, id: string): Promise<void> {
  await db[table].update(id, { _deleted: 1, _dirty: 1 } as never);
  emitChange();
}

export async function get<K extends SyncedTable>(table: K, id: string): Promise<EntityMap[K] | undefined> {
  const row = (await db[table].get(id)) as Row<EntityMap[K]> | undefined;
  return row && !row._deleted ? strip(row) : undefined;
}

export async function all<K extends SyncedTable>(table: K): Promise<EntityMap[K][]> {
  const rows = (await db[table].toArray()) as unknown as Row<EntityMap[K]>[];
  return rows.filter((r) => !r._deleted).map((r) => strip(r));
}

export { strip };

// ---------- Settings ----------

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  unit: 'kg',
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbells: [],
  kettlebells: [8, 12, 16, 20, 24, 28, 32, 36, 40, 48],
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
  defaultRestSec: 120,
  defaultRule: 'double',
  activeProgramId: null,
  soundEnabled: true,
  vibrationEnabled: true,
  remindersEnabled: false,
  reminderTime: '17:00',
  bodyWeight: null,
};

export async function getSettings(): Promise<Settings> {
  const s = await get('settings', 'settings');
  return { ...DEFAULT_SETTINGS, ...s, defaultSteps: { ...DEFAULT_SETTINGS.defaultSteps, ...s?.defaultSteps } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await put('settings', { ...current, ...patch, id: 'settings' });
}

// ---------- Sessions & sets ----------

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  const rows = (await db.sessions.where('status').equals('active').toArray()).filter((r) => !r._deleted);
  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return rows[0] ? strip(rows[0]) : undefined;
}

/** Id prefix of the starter passes and programs earlier versions created for every account. */
export const STARTER_PREFIX = 'st-';

/**
 * Soft-delete starter passes and programs (synced as deleted, so other devices follow) and
 * clear the active program if it was one. History keeps working: sessions copy their exercises.
 * Returns how many rows were removed; cheap to call after every sync.
 */
export async function removeStarterContent(): Promise<number> {
  let n = 0;
  for (const table of ['templates', 'programs'] as const) {
    const rows = await db[table].where('id').startsWith(STARTER_PREFIX).toArray();
    for (const r of rows) {
      if (r._deleted) continue;
      await remove(table, r.id);
      n++;
    }
  }
  const settings = await getSettings();
  if (settings.activeProgramId?.startsWith(STARTER_PREFIX)) await saveSettings({ activeProgramId: null });
  return n;
}

/**
 * Two devices that start a pass offline can both end up with an active session after syncing.
 * Keep the one with the latest activity (last logged set, else start time; id breaks ties so every
 * device picks the same one). The others are closed as completed passes if they have sets, so no
 * logged data is lost, and removed if they are empty. Returns how many sessions were resolved.
 */
export async function resolveDuplicateActiveSessions(): Promise<number> {
  const active = (await db.sessions.where('status').equals('active').toArray()).filter((r) => !r._deleted);
  if (active.length < 2) return 0;
  const withSets = await Promise.all(active.map(async (s) => ({ s, sets: await getSessionSets(s.id) })));
  const lastActivity = ({ s, sets }: (typeof withSets)[number]) =>
    sets.reduce((m, x) => (x.completedAt > m ? x.completedAt : m), s.startedAt);
  withSets.sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)) || b.s.id.localeCompare(a.s.id));
  for (const other of withSets.slice(1)) {
    if (!other.sets.length) {
      await remove('sessions', other.s.id);
      continue;
    }
    const used = new Set(other.sets.map((x) => x.sessionExerciseId));
    await put('sessions', {
      ...strip(other.s),
      status: 'completed',
      endedAt: lastActivity(other),
      exercises: other.s.exercises.filter((e) => used.has(e.id)),
    });
  }
  return withSets.length - 1;
}

export async function getSessionSets(sessionId: string): Promise<SetEntry[]> {
  const rows = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter((r) => !r._deleted);
  return rows.map((r) => strip(r)).sort((a, b) => a.order - b.order || a.completedAt.localeCompare(b.completedAt));
}

/**
 * History for the progression engine: one entry per completed session in which the exercise
 * was performed, newest first. `excludeSessionId` lets the active session be ignored.
 */
export async function getExerciseHistory(exerciseId: string, excludeSessionId?: string): Promise<ExerciseHistoryEntry[]> {
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((r) => !r._deleted);
  const bySession = new Map<string, Row<SetEntry>[]>();
  for (const s of sets) {
    if (s.sessionId === excludeSessionId) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const sessions = (await db.sessions.bulkGet([...bySession.keys()])).filter(
    (s): s is Row<WorkoutSession> => !!s && !s._deleted && s.status === 'completed',
  );
  const entries: ExerciseHistoryEntry[] = [];
  for (const session of sessions) {
    const sessionSets = bySession.get(session.id)!.sort((a, b) => a.order - b.order);
    const se = session.exercises.find((e) => e.exerciseId === exerciseId);
    entries.push({
      sessionId: session.id,
      date: session.startedAt,
      sets: sessionSets.map(({ type, reps, weight, rpe, durationSec }) => ({ type, reps, weight, rpe, durationSec })),
      prescription: se ?? { sets: sessionSets.length, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double' },
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getProgram(id: string | null): Promise<Program | undefined> {
  return id ? get('programs', id) : undefined;
}
