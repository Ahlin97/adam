import { describe, expect, it } from 'vitest';
import type { Exercise, SetEntry, WorkoutSession } from '@/engine/types.ts';
import {
  epley,
  exerciseRecords,
  exerciseSeries,
  isoWeek,
  categorySetsForWeek,
  muscleSetsForWeek,
  weeksToShow,
  sessionsPerWeek,
  startOfWeek,
  trainedExercises,
  weekLabel,
} from './aggregate';

const session = (id: string, startedAt: string, status: WorkoutSession['status'] = 'completed') => ({
  id,
  name: `Pass ${id}`,
  status,
  startedAt,
});

let n = 0;
const set = (sessionId: string, exerciseId: string, weight: number, reps: number, type: SetEntry['type'] = 'working') => ({
  sessionId,
  exerciseId,
  weight,
  reps,
  type,
  durationSec: null,
  order: n++,
});

describe('epley', () => {
  it('follows the formula', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.333, 2);
    expect(epley(100, 0)).toBe(0);
  });
});

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    const d = startOfWeek(new Date(2026, 9, 25, 12)); // Sunday 25 Oct 2026
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(19);
  });
  it('computes ISO week numbers', () => {
    expect(isoWeek(new Date(2026, 9, 24)).week).toBe(43);
    expect(isoWeek(new Date(2021, 0, 3))).toEqual({ year: 2020, week: 53 }); // Sunday
    expect(isoWeek(new Date(2021, 0, 4))).toEqual({ year: 2021, week: 1 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
    expect(weekLabel(new Date(2026, 9, 24))).toBe('v. 43');
  });
});

describe('sessionsPerWeek', () => {
  it('counts completed sessions in the last N weeks', () => {
    const now = new Date(2026, 9, 24, 10);
    const sessions = [
      session('a', new Date(2026, 9, 19, 8).toISOString()),
      session('b', new Date(2026, 9, 21, 8).toISOString()),
      session('c', new Date(2026, 9, 14, 8).toISOString()),
      session('d', new Date(2026, 9, 22, 8).toISOString(), 'active'),
      session('e', new Date(2025, 9, 22, 8).toISOString()),
    ];
    const weeks = sessionsPerWeek(sessions, 12, now);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toMatchObject({ label: 'v. 43', count: 2 });
    expect(weeks[10]).toMatchObject({ label: 'v. 42', count: 1 });
    expect(weeks.reduce((s, w) => s + w.count, 0)).toBe(3);
  });
});

describe('muscleSetsForWeek', () => {
  it('counts primary 1 and secondary 0.5, ignoring warmups and other weeks', () => {
    const ex = new Map<string, Pick<Exercise, 'primaryMuscle' | 'secondaryMuscles'>>([
      ['bench', { primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'] }],
      ['curl', { primaryMuscle: 'biceps', secondaryMuscles: [] }],
    ]);
    const sessions = [session('a', new Date(2026, 9, 20, 8).toISOString()), session('old', new Date(2026, 9, 1).toISOString())];
    const sets = [
      set('a', 'bench', 40, 10, 'warmup'),
      set('a', 'bench', 80, 8),
      set('a', 'bench', 80, 8),
      set('a', 'bench', 60, 12, 'drop'),
      set('a', 'curl', 15, 10),
      set('old', 'curl', 15, 10),
    ];
    const res = muscleSetsForWeek(sets, sessions, ex, new Date(2026, 9, 19));
    expect(res).toEqual([
      { muscle: 'chest', sets: 3 },
      { muscle: 'shoulders', sets: 1.5 },
      { muscle: 'triceps', sets: 1.5 },
      { muscle: 'biceps', sets: 1 },
    ]);
  });
});

describe('categorySetsForWeek', () => {
  it('counts each working set once under its primary muscle category', () => {
    const ex = new Map<string, Pick<Exercise, 'primaryMuscle'>>([
      ['bench', { primaryMuscle: 'chest' }],
      ['curl', { primaryMuscle: 'biceps' }],
      ['pushdown', { primaryMuscle: 'triceps' }],
    ]);
    const sessions = [session('a', new Date(2026, 9, 20, 8).toISOString())];
    const sets = [set('a', 'bench', 40, 10, 'warmup'), set('a', 'bench', 80, 8), set('a', 'curl', 15, 10), set('a', 'pushdown', 20, 10), set('a', 'pushdown', 20, 10)];
    const arms = (m: string) => (['biceps', 'triceps'].includes(m) ? 'arms' : 'chest');
    expect(categorySetsForWeek(sets, sessions, ex, new Date(2026, 9, 19), arms)).toEqual([
      { category: 'arms', sets: 3 },
      { category: 'chest', sets: 1 },
    ]);
  });
});

describe('weeksToShow', () => {
  it('starts at the first pass, between 4 and 12 weeks', () => {
    const now = new Date(2026, 9, 29);
    expect(weeksToShow([], now)).toBe(4);
    expect(weeksToShow([session('a', new Date(2026, 9, 27).toISOString())], now)).toBe(4);
    expect(weeksToShow([session('a', new Date(2026, 8, 7).toISOString())], now)).toBe(8);
    expect(weeksToShow([session('a', new Date(2025, 0, 1).toISOString())], now)).toBe(12);
  });
});

describe('exerciseSeries & records', () => {
  const sessions = [
    session('s1', '2026-10-01T08:00:00.000Z'),
    session('s2', '2026-10-08T08:00:00.000Z'),
    session('active', '2026-10-10T08:00:00.000Z', 'active'),
  ];
  const sets = [
    set('s2', 'bench', 85, 5),
    set('s2', 'bench', 80, 8),
    set('s1', 'bench', 20, 10, 'warmup'),
    set('s1', 'bench', 80, 10),
    set('s1', 'bench', 80, 9),
    set('s1', 'squat', 100, 5),
    set('active', 'bench', 200, 1),
  ];
  const series = exerciseSeries(sets, sessions, 'bench');

  it('builds one point per completed session, oldest first', () => {
    expect(series.map((p) => p.sessionId)).toEqual(['s1', 's2']);
    expect(series[0]).toMatchObject({ heaviest: 80, volume: 80 * 19, workingSets: 2, totalReps: 19 });
    expect(series[0].best1RM).toBeCloseTo(80 * (1 + 10 / 30));
    expect(series[1]).toMatchObject({ heaviest: 85, volume: 85 * 5 + 80 * 8 });
    expect(series[0].sets).toHaveLength(3);
  });

  it('finds PRs', () => {
    const r = exerciseRecords(series);
    expect(r.heaviest).toMatchObject({ weight: 85, reps: 5, date: '2026-10-08T08:00:00.000Z' });
    expect(r.best1RM?.value).toBeCloseTo(106.667, 2); // 80 × 10
    expect(r.best1RM?.date).toBe('2026-10-01T08:00:00.000Z');
    expect(r.repsAtWeight).toEqual([
      { weight: 85, reps: 5, date: '2026-10-08T08:00:00.000Z' },
      { weight: 80, reps: 10, date: '2026-10-01T08:00:00.000Z' },
    ]);
    expect(r.mostReps?.reps).toBe(10);
  });

  it('handles no data', () => {
    expect(exerciseRecords([])).toEqual({ heaviest: null, best1RM: null, mostReps: null, repsAtWeight: [] });
  });

  it('lists trained exercises most recent first', () => {
    expect(trainedExercises(sets, sessions)).toEqual([
      { exerciseId: 'bench', lastDate: '2026-10-08T08:00:00.000Z', sessionCount: 2 },
      { exerciseId: 'squat', lastDate: '2026-10-01T08:00:00.000Z', sessionCount: 1 },
    ]);
  });
});
