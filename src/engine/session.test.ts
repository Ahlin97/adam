import { describe, expect, it } from 'vitest';
import {
  buildSession,
  estimateMinutes,
  nextSetInSession,
  scheduledTemplateId,
  summarizeSession,
  upcomingSchedule,
} from './index.ts';
import type { Program, SessionExercise, SetEntry, SetType, TemplateExercise, WorkoutSession, WorkoutTemplate } from './types.ts';
import { NOW, entry, exercise, profile, rx } from './fixtures.test-utils.ts';

// ---------- schedule ----------
const weekProgram: Program = {
  id: 'p1',
  name: 'PPL',
  mode: 'weekdays',
  weekdays: ['push', null, 'pull', null, 'legs', null, null],
  rotation: [],
  reminderDays: [false, false, false, false, false, false, false],
};
const rotProgram: Program = {
  id: 'p2',
  name: 'A/B',
  mode: 'rotation',
  weekdays: [null, null, null, null, null, null, null],
  rotation: ['A', 'B', 'C'],
  reminderDays: [true, false, true, false, true, false, false],
};
// 2026-10-26 is a Monday
const mon = new Date(2026, 9, 26, 10);
const wed = new Date(2026, 9, 28, 10);
const tue = new Date(2026, 9, 27, 10);
const done = (templateId: string, startedAt: Date, programId = 'p2') => ({
  programId,
  templateId,
  startedAt: startedAt.toISOString(),
  status: 'completed' as const,
});

describe('scheduledTemplateId', () => {
  it('weekdays: index 0 = Monday, null = rest day', () => {
    expect(scheduledTemplateId(weekProgram, [], mon)).toBe('push');
    expect(scheduledTemplateId(weekProgram, [], tue)).toBeNull();
    expect(scheduledTemplateId(weekProgram, [], wed)).toBe('pull');
    expect(scheduledTemplateId(weekProgram, [], new Date(2026, 10, 1, 10))).toBeNull(); // Sunday
  });
  it('rotation: first when nothing completed, then next after latest', () => {
    expect(scheduledTemplateId(rotProgram, [], mon)).toBe('A');
    const c = [done('A', new Date(2026, 9, 20)), done('B', new Date(2026, 9, 22))];
    expect(scheduledTemplateId(rotProgram, c, mon)).toBe('C');
    expect(scheduledTemplateId(rotProgram, [...c, done('C', new Date(2026, 9, 24))], mon)).toBe('A');
  });
  it('rotation ignores other programs and active sessions', () => {
    const c = [
      done('A', new Date(2026, 9, 20)),
      done('B', new Date(2026, 9, 22), 'other'),
      { ...done('B', new Date(2026, 9, 23)), status: 'active' as const },
    ];
    expect(scheduledTemplateId(rotProgram, c, mon)).toBe('B');
  });
});

describe('upcomingSchedule', () => {
  it('weekdays: next training days from date (inclusive)', () => {
    const u = upcomingSchedule(weekProgram, [], tue, 4);
    expect(u.map((x) => x.templateId)).toEqual(['pull', 'legs', 'push', 'pull']);
    expect(u[0].date.getDate()).toBe(28);
    expect(u[2].date.getDate()).toBe(2); // next Monday, 2 Nov
  });
  it('rotation: uses reminderDays as training days and continues the rotation', () => {
    const u = upcomingSchedule(rotProgram, [done('A', new Date(2026, 9, 23))], tue, 4);
    expect(u.map((x) => [x.date.getDate(), x.templateId])).toEqual([
      [28, 'B'],
      [30, 'C'],
      [2, 'A'],
      [4, 'B'],
    ]);
  });
  it('rotation without reminder days → every day', () => {
    const p = { ...rotProgram, reminderDays: [false, false, false, false, false, false, false] };
    expect(upcomingSchedule(p, [], mon, 4).map((x) => x.templateId)).toEqual(['A', 'B', 'C', 'A']);
  });
  it('empty program', () => {
    expect(upcomingSchedule({ ...weekProgram, weekdays: [null, null, null, null, null, null, null] }, [], mon, 3)).toEqual([]);
  });
});

// ---------- templates & sessions ----------
const te = (over: Partial<TemplateExercise>): TemplateExercise => ({
  ...rx(),
  id: 'te',
  exerciseId: 'ex1',
  supersetGroup: null,
  notes: '',
  ...over,
});

describe('estimateMinutes', () => {
  it('sets × (45 s + rest) + warmups', () => {
    const t = { exercises: [te({ sets: 3, restSec: 120, warmupSets: 0 }), te({ sets: 4, restSec: 75, warmupSets: 2 })] };
    // 3×165 + 4×120 + 2×75 = 495 + 480 + 150 = 1125 s ≈ 19 min
    expect(estimateMinutes(t)).toBe(19);
    expect(estimateMinutes({ exercises: [] })).toBe(0);
  });
});

describe('buildSession', () => {
  const bench = exercise({ id: 'bench', weightStep: 2.5 });
  const template: WorkoutTemplate = {
    id: 'push',
    name: 'Push',
    notes: '',
    exercises: [
      te({ id: 't1', exerciseId: 'bench', notes: 'Paus på bröstet' }),
      te({ id: 't2', exerciseId: 'missing' }),
    ],
  };
  it('copies prescriptions with fresh ids and attaches suggestions', () => {
    let n = 0;
    const s = buildSession({
      id: 'sess',
      newId: () => `id${++n}`,
      template,
      programId: 'p1',
      exercises: new Map([['bench', bench]]),
      histories: new Map([['bench', [entry(3, 80, [12, 12, 12])]]]),
      profile,
      now: NOW,
    });
    expect(s).toMatchObject({
      id: 'sess',
      name: 'Push',
      templateId: 'push',
      programId: 'p1',
      status: 'active',
      startedAt: NOW.toISOString(),
      endedAt: null,
    });
    expect(s.exercises).toHaveLength(1);
    expect(s.exercises[0]).toMatchObject({ id: 'id1', exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12, notes: 'Paus på bröstet' });
    expect(s.exercises[0].suggestion).toMatchObject({ kind: 'increase', weight: 82.5 });
  });
  it('empty session', () => {
    const s = buildSession({
      id: 'x',
      newId: () => 'y',
      template: null,
      programId: null,
      exercises: new Map(),
      histories: new Map(),
      profile,
      now: NOW,
    });
    expect(s).toMatchObject({ name: 'Tomt pass', templateId: null, exercises: [], status: 'active' });
  });
});

const se = (id: string, over: Partial<SessionExercise> = {}): SessionExercise => ({
  ...rx({ sets: 2, warmupSets: 0 }),
  id,
  exerciseId: `ex-${id}`,
  supersetGroup: null,
  notes: '',
  suggestion: { kind: 'increase', weight: 80, reps: 8, sets: 2, reason: '', readyToIncrease: true, plateau: false },
  ...over,
});
const session = (exercises: SessionExercise[]): WorkoutSession => ({
  id: 'S',
  name: 'Test',
  templateId: null,
  programId: null,
  status: 'active',
  startedAt: '2026-10-24T10:00:00.000Z',
  endedAt: null,
  notes: '',
  exercises,
});
let order = 0;
const logged = (seId: string, type: SetType, weight: number, reps: number): SetEntry => ({
  id: `set${++order}`,
  sessionId: 'S',
  sessionExerciseId: seId,
  exerciseId: `ex-${seId}`,
  order,
  type,
  reps,
  weight,
  durationSec: null,
  rpe: null,
  completedAt: '2026-10-24T10:10:00.000Z',
});

describe('nextSetInSession', () => {
  it('warmups first (50 %, 8 reps), then working sets from suggestion', () => {
    const s = session([se('a', { warmupSets: 1 })]);
    expect(nextSetInSession(s, [])).toEqual({
      sessionExerciseId: 'a',
      exerciseId: 'ex-a',
      setNumber: 1,
      totalSets: 3,
      type: 'warmup',
      reps: 8,
      weight: 40,
      restSec: 120,
    });
    const sets = [logged('a', 'warmup', 40, 8)];
    expect(nextSetInSession(s, sets)).toMatchObject({ type: 'working', setNumber: 2, weight: 80, reps: 8 });
  });
  it('rounds warmup weight with equipment when given', () => {
    const s = session([se('a', { warmupSets: 1, suggestion: { ...se('a').suggestion!, weight: 85 } })]);
    expect(nextSetInSession(s, [])!.weight).toBe(42.5);
    const ex = exercise({ id: 'ex-a' });
    expect(nextSetInSession(s, [], { exercises: new Map([['ex-a', ex]]), profile })!.weight).toBe(42.5);
  });
  it('prefills from last logged working set, then moves to next exercise', () => {
    const s = session([se('a'), se('b')]);
    let sets = [logged('a', 'working', 77.5, 9)];
    expect(nextSetInSession(s, sets)).toMatchObject({ sessionExerciseId: 'a', setNumber: 2, weight: 77.5, reps: 9 });
    sets = [...sets, logged('a', 'failure', 77.5, 7)];
    expect(nextSetInSession(s, sets)).toMatchObject({ sessionExerciseId: 'b', setNumber: 1, weight: 80 });
  });
  it('skips warmups once a working set is logged', () => {
    const s = session([se('a', { warmupSets: 2 })]);
    expect(nextSetInSession(s, [logged('a', 'working', 80, 8)])).toMatchObject({ type: 'working', setNumber: 4 });
  });
  it('supersets alternate between consecutive exercises in the group', () => {
    const s = session([se('a', { supersetGroup: 'g' }), se('b', { supersetGroup: 'g', sets: 3 }), se('c')]);
    const sets: SetEntry[] = [];
    const seq: string[] = [];
    for (let i = 0; i < 8; i++) {
      const n = nextSetInSession(s, sets);
      if (!n) break;
      seq.push(`${n.sessionExerciseId}${n.setNumber}`);
      sets.push(logged(n.sessionExerciseId, n.type, n.weight ?? 0, n.reps));
    }
    expect(seq).toEqual(['a1', 'b1', 'a2', 'b2', 'b3', 'c1', 'c2']);
    expect(nextSetInSession(s, sets)).toBeNull();
  });
  it('null weight when no suggestion weight (first time)', () => {
    const s = session([se('a', { suggestion: null })]);
    expect(nextSetInSession(s, [])).toMatchObject({ weight: null, reps: 8 });
  });
});

describe('summarizeSession', () => {
  it('duration, non-warmup set count and volume', () => {
    const s = { ...session([se('a')]), endedAt: '2026-10-24T11:05:30.000Z' };
    const sets = [logged('a', 'warmup', 40, 8), logged('a', 'working', 80, 10), logged('a', 'drop', 60, 8), { ...logged('a', 'working', 80, 10), sessionId: 'other' }];
    expect(summarizeSession(s, sets, NOW)).toEqual({ durationSec: 3930, setCount: 2, volumeKg: 1280 });
  });
  it('active session uses now', () => {
    expect(summarizeSession(session([]), [], new Date('2026-10-24T10:30:00Z')).durationSec).toBe(1800);
  });
});
