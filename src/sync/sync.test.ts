import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Supabase tables (only the calls sync.ts uses).
type ServerRow = { user_id: string; id: string; data: Record<string, unknown>; deleted: boolean; seq: number };
const server = new Map<string, Map<string, ServerRow>>();
let seq = 0;
let failPush = false;

function table(name: string) {
  if (!server.has(name)) server.set(name, new Map());
  return server.get(name)!;
}

const fakeClient = {
  from(name: string) {
    return {
      async upsert(rows: Omit<ServerRow, 'seq'>[]) {
        if (failPush) return { error: new Error('network') };
        for (const r of rows) table(name).set(r.id, { ...r, seq: ++seq });
        return { error: null };
      },
      select() {
        let min = 0;
        let lim = Infinity;
        const q = {
          eq: () => q,
          gt: (_c: string, v: number) => ((min = v), q),
          order: () => q,
          limit: (n: number) => ((lim = n), q),
          then(resolve: (v: { data: ServerRow[]; error: null }) => void) {
            const data = [...table(name).values()].filter((r) => r.seq > min).sort((a, b) => a.seq - b.seq).slice(0, lim);
            resolve({ data, error: null });
          },
        };
        return q;
      },
    };
  },
};

vi.mock('@/lib/supabase', () => ({ supabase: fakeClient, functionsUrl: null }));
vi.stubGlobal('navigator', { onLine: true });

const { db } = await import('@/db/db');
const repo = await import('@/db/repo');
const { setSyncUser, syncNow } = await import('./sync');

const set = (id: string, reps: number) => ({
  id,
  sessionId: 's1',
  sessionExerciseId: 'se1',
  exerciseId: 'bi-bench',
  order: 0,
  type: 'working' as const,
  reps,
  weight: 80,
  durationSec: null,
  rpe: null,
  completedAt: new Date().toISOString(),
});

describe('sync', () => {
  beforeEach(async () => {
    server.clear();
    seq = 0;
    failPush = false;
    await Promise.all(db.tables.map((t) => t.clear()));
    await setSyncUser('user-1');
  });

  it('keeps sets locally while offline and pushes them later', async () => {
    failPush = true;
    await repo.put('sets', set('a', 10));
    await syncNow();
    expect((await db.sets.get('a'))?._dirty).toBe(1);
    expect(table('sets').size).toBe(0);

    failPush = false;
    await syncNow();
    expect(table('sets').get('a')?.data.reps).toBe(10);
    expect((await db.sets.get('a'))?._dirty).toBe(0);
  });

  it('pulls rows written elsewhere (e.g. the watch API)', async () => {
    table('sets').set('w', { user_id: 'user-1', id: 'w', data: set('w', 8), deleted: false, seq: ++seq });
    await syncNow();
    expect((await repo.get('sets', 'w'))?.reps).toBe(8);
  });

  it('does not overwrite unsynced local edits with server data', async () => {
    table('sets').set('x', { user_id: 'user-1', id: 'x', data: set('x', 5), deleted: false, seq: ++seq });
    failPush = true;
    await repo.put('sets', set('x', 12));
    await syncNow();
    expect((await repo.get('sets', 'x'))?.reps).toBe(12);
    failPush = false;
    await syncNow();
    expect(table('sets').get('x')?.data.reps).toBe(12);
  });

  it('syncs soft deletes', async () => {
    await repo.put('sets', set('d', 6));
    await syncNow();
    await repo.remove('sets', 'd');
    await syncNow();
    expect(table('sets').get('d')?.deleted).toBe(true);
    expect(await repo.get('sets', 'd')).toBeUndefined();
  });
});
