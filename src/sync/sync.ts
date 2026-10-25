// Local-first sync: Dexie (IndexedDB) is what the app reads and writes; this module pushes
// dirty rows to Supabase and pulls rows changed elsewhere (other device, Apple Watch API).
// Conflicts: a locally dirty row wins and is pushed; otherwise the server copy wins.
import { useSyncExternalStore } from 'react';
import { db, SYNCED_TABLES, type SyncedTable } from '@/db/db';
import { onLocalChange, resolveDuplicateActiveSessions, strip } from '@/db/repo';
import { supabase } from '@/lib/supabase';

export type SyncState = 'local-only' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';
interface Status {
  state: SyncState;
  lastSyncedAt: string | null;
  error: string | null;
}

let status: Status = { state: supabase ? 'signed-out' : 'local-only', lastSyncedAt: null, error: null };
const subs = new Set<() => void>();
function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch };
  subs.forEach((f) => f());
}
export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => status,
  );
}

let userId: string | null = null;
let running: Promise<void> | null = null;
let again = false;

const PAGE = 1000;

async function pushTable(table: SyncedTable) {
  const dirty = await db[table].where('_dirty').equals(1).toArray();
  if (!dirty.length || !supabase || !userId) return;
  for (let i = 0; i < dirty.length; i += 500) {
    const chunk = dirty.slice(i, i + 500);
    const payload = chunk.map((row) => ({
      user_id: userId,
      id: row.id,
      data: strip(row as never),
      deleted: row._deleted === 1,
    }));
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'user_id,id' });
    if (error) throw error;
    // Clear the dirty flag only if the row was not modified again while we were pushing.
    await db.transaction('rw', db[table], async () => {
      for (const sent of chunk) {
        const current = await db[table].get(sent.id);
        if (current && JSON.stringify(current) === JSON.stringify(sent)) {
          await db[table].update(sent.id, { _dirty: 0 } as never);
        }
      }
    });
  }
}

async function pullTable(table: SyncedTable) {
  if (!supabase || !userId) return;
  const key = `cursor:${table}`;
  let cursor = Number((await db.meta.get(key))?.value ?? 0);
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id,data,deleted,seq')
      .eq('user_id', userId)
      .gt('seq', cursor)
      .order('seq', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (!data?.length) break;
    await db.transaction('rw', db[table], db.meta, async () => {
      for (const r of data as { id: string; data: object; deleted: boolean; seq: number }[]) {
        const local = await db[table].get(r.id);
        if (!local?._dirty) {
          await db[table].put({ ...(r.data as object), id: r.id, _dirty: 0, _deleted: r.deleted ? 1 : 0 } as never);
        }
        cursor = Math.max(cursor, r.seq);
      }
      await db.meta.put({ key, value: cursor });
    });
    if (data.length < PAGE) break;
  }
}

async function runOnce() {
  if (!supabase || !userId) return;
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  setStatus({ state: 'syncing', error: null });
  try {
    for (const t of SYNCED_TABLES) await pushTable(t);
    for (const t of SYNCED_TABLES) await pullTable(t);
    // A pull can bring in a second active pass from another device; settle it (pushed on the next run).
    if (await resolveDuplicateActiveSessions()) again = true;
    setStatus({ state: 'idle', lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: msg });
  }
}

/** Run a sync now (coalesces concurrent calls). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => (running = null));
  return running;
}

let debounce: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(ms = 1500) {
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), ms);
}

/** Number of local changes not yet pushed. */
export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNCED_TABLES) n += await db[t].where('_dirty').equals(1).count();
  return n;
}

/** Called by the auth layer when the signed-in user changes. Clears local data on user switch. */
export async function setSyncUser(id: string | null): Promise<void> {
  userId = id;
  if (!supabase) return;
  if (!id) {
    setStatus({ state: 'signed-out' });
    return;
  }
  const prev = (await db.meta.get('userId'))?.value;
  if (prev && prev !== id) {
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db[t]), db.meta], async () => {
      for (const t of SYNCED_TABLES) await db[t].clear();
      await db.meta.clear();
    });
  }
  await db.meta.put({ key: 'userId', value: id });
  setStatus({ state: navigator.onLine ? 'idle' : 'offline' });
  await syncNow();
}

let started = false;
/** Wire up automatic sync triggers. Safe to call more than once. */
export function startSyncLoop(): void {
  if (started || !supabase) return;
  started = true;
  onLocalChange(() => scheduleSync());
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  // Poll so sets logged from the watch show up; cheap because pulls are cursor based.
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 20_000);
}
