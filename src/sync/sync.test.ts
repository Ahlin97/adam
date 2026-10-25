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

  it('settles two active passes from different devices without losing sets', async () => {
    const session = (id: string, startedAt: string) => ({
      id,
      name: id,
      notes: '',
      status: 'active' as const,
      startedAt,
      endedAt: null,
      templateId: null,
      programId: null,
      exercises: [{ id: `${id}-se`, exerciseId: 'bi-bench', sets: 3, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double' as const, notes: '', supersetGroup: null, suggestion: null }],
    });
    // This device: an older pass with one set. Other device (on the server): a newer pass, and an empty one.
    await repo.put('sessions', session('phone', '2026-10-25T10:00:00Z'));
    await repo.put('sets', { ...set('p1', 8), sessionId: 'phone', sessionExerciseId: 'phone-se', completedAt: '2026-10-25T10:05:00Z' });
    table('sessions').set('web', { user_id: 'user-1', id: 'web', data: session('web', '2026-10-25T10:02:00Z'), deleted: false, seq: ++seq });
    table('sets').set('w1', { user_id: 'user-1', id: 'w1', data: { ...set('w1', 9), sessionId: 'web', sessionExerciseId: 'web-se', completedAt: '2026-10-25T10:10:00Z' }, deleted: false, seq: ++seq });
    table('sessions').set('empty', { user_id: 'user-1', id: 'empty', data: session('empty', '2026-10-25T09:00:00Z'), deleted: false, seq: ++seq });

    await syncNow();

    expect((await repo.getActiveSession())?.id).toBe('web');
    expect(await repo.get('sessions', 'phone')).toMatchObject({ status: 'completed', endedAt: '2026-10-25T10:05:00Z' });
    expect(await repo.get('sessions', 'empty')).toBeUndefined();
    expect(await repo.get('sets', 'p1')).toBeDefined();
    // The resolution itself is pushed so other devices converge.
    expect(table('sessions').get('phone')?.data.status).toBe('completed');
    expect(table('sessions').get('empty')?.deleted).toBe(true);
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
