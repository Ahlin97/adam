// Integration: seed → start from template → log sets → finish → next session suggests progression.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./alerts', () => ({ unlockAudio: () => {}, requestNotificationPermission: () => {} }));
vi.mock('@/lib/supabase', () => ({ supabase: null, functionsUrl: null }));

const { db } = await import('@/db/db');
const { ensureSeeded } = await import('@/data/seed');
const { getActiveSession, getSessionSets, getExerciseHistory } = await import('@/db/repo');
const { startSession, logSet, finishSession, replaceExercise } = await import('./start');
const { nextSetInSession } = await import('@/engine');

async function doSession(templateId: string, weightFor: (exerciseId: string) => number, repsFor = () => 5) {
  const id = await startSession({ templateId, programId: null });
  const session = (await getActiveSession())!;
  expect(session.id).toBe(id);
  for (;;) {
    const next = nextSetInSession(session, await getSessionSets(id));
    if (!next) break;
    await logSet({
      sessionId: id,
      sessionExerciseId: next.sessionExerciseId,
      exerciseId: next.exerciseId,
      type: next.type,
      reps: next.type === 'warmup' ? next.reps : repsFor(),
      weight: next.type === 'warmup' ? (next.weight ?? 20) : weightFor(next.exerciseId),
      durationSec: null,
      rpe: null,
    });
  }
  await finishSession(id);
  return id;
}

describe('workout flow', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await ensureSeeded();
  });

  it('suggests +5 kg squat after a completed 5 × 5 session', async () => {
    const template = (await db.templates.get('st-5x5-a'))!;
    expect(template).toBeTruthy();
    const squat = template.exercises[0].exerciseId;

    const first = await doSession(template.id, (ex) => (ex === squat ? 100 : 40));
    expect((await db.sessions.get(first))!.status).toBe('completed');
    expect((await getExerciseHistory(squat)).length).toBe(1);

    await startSession({ templateId: template.id, programId: null });
    const second = (await getActiveSession())!;
    const se = second.exercises.find((e) => e.exerciseId === squat)!;
    expect(se.suggestion?.kind).toBe('increase');
    expect(se.suggestion?.weight).toBe(105);
    expect(se.suggestion?.readyToIncrease).toBe(true);
  });

  it('repeats the weight when a set was missed', async () => {
    const template = (await db.templates.get('st-5x5-a'))!;
    const squat = template.exercises[0].exerciseId;
    let n = 0;
    await doSession(template.id, (ex) => (ex === squat ? 100 : 40), () => (++n === 3 ? 4 : 5));
    await startSession({ templateId: template.id, programId: null });
    const se = (await getActiveSession())!.exercises.find((e) => e.exerciseId === squat)!;
    expect(se.suggestion?.weight).toBe(100);
    expect(se.suggestion?.kind).toBe('repeat');
  });

  it('swapping after warm-ups replaces the exercise and skips a second warm-up', async () => {
    const id = await startSession({ templateId: 'st-5x5-b', programId: null });
    let session = (await getActiveSession())!;
    const press = session.exercises[1];
    const log = (seId: string, exerciseId: string, type: 'warmup' | 'working') =>
      logSet({ sessionId: id, sessionExerciseId: seId, exerciseId, type, reps: 5, weight: 20, durationSec: null, rpe: null });
    await log(press.id, press.exerciseId, 'warmup');
    await log(press.id, press.exerciseId, 'warmup');

    const db_press = (await db.exercises.get('bi-db-shoulder-press'))!;
    const newId = (await replaceExercise(id, press.id, db_press))!;
    session = (await getActiveSession())!;
    expect(session.exercises.map((e) => e.exerciseId)).toEqual(['bi-squat', 'bi-db-shoulder-press', 'bi-deadlift']);
    expect(session.exercises[1]).toMatchObject({ id: newId, warmupSets: 0, sets: press.sets });
    expect((await getSessionSets(id)).filter((s) => s.sessionExerciseId === press.id)).toHaveLength(0);

    // With a working set logged the old exercise stays (trimmed) and the new one follows it.
    const squat = session.exercises[0];
    await log(squat.id, squat.exerciseId, 'working');
    await replaceExercise(id, squat.id, (await db.exercises.get('bi-front-squat'))!);
    session = (await getActiveSession())!;
    expect(session.exercises.map((e) => e.exerciseId)).toEqual(['bi-squat', 'bi-front-squat', 'bi-db-shoulder-press', 'bi-deadlift']);
    expect(session.exercises[0]).toMatchObject({ sets: 1, warmupSets: 0 });
    expect(session.exercises[1].warmupSets).toBe(0);
  });

  it('"Kör igen" starts a new pass with the same exercises and fresh suggestions', async () => {
    const template = (await db.templates.get('st-5x5-a'))!;
    const squat = template.exercises[0].exerciseId;
    const first = await doSession(template.id, (ex) => (ex === squat ? 100 : 40));
    await startSession({ templateId: null, programId: null, repeatSessionId: first });
    const again = (await getActiveSession())!;
    expect(again.id).not.toBe(first);
    expect(again).toMatchObject({ name: '5 × 5 A', templateId: 'st-5x5-a', status: 'active' });
    expect(again.exercises.map((e) => e.exerciseId)).toEqual(template.exercises.map((e) => e.exerciseId));
    expect(again.exercises[0].suggestion?.weight).toBe(105);
  });
});
