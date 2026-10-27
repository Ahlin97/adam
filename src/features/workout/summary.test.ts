import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@/engine';
import { compareToLast, lastTimeSets, recordLines } from './SummaryPage';
import type { Exercise, WorkoutSession } from '@/engine';

const s = (sessionId: string, weight: number, reps: number, at: string, type: SetEntry['type'] = 'working'): SetEntry => ({
  id: `${sessionId}-${weight}-${reps}-${at}`,
  sessionId,
  sessionExerciseId: 'se',
  exerciseId: 'ex',
  order: 0,
  type,
  reps,
  weight,
  durationSec: null,
  rpe: null,
  completedAt: at,
});

describe('summary comparison', () => {
  it('picks the working sets of the most recent earlier session', () => {
    const prior = [s('old', 50, 5, '2026-10-01'), s('mid', 55, 5, '2026-10-10'), s('mid', 20, 8, '2026-10-10', 'warmup')];
    expect(lastTimeSets(prior).map((x) => x.weight)).toEqual([55]);
    expect(lastTimeSets([])).toEqual([]);
  });

  it('compares top weight, then reps at that weight', () => {
    const before = [s('a', 60, 5, '1'), s('a', 60, 5, '1')];
    expect(compareToLast([s('b', 62.5, 5, '2')], before)).toBe(1);
    expect(compareToLast([s('b', 57.5, 5, '2')], before)).toBe(-1);
    expect(compareToLast([s('b', 60, 5, '2'), s('b', 60, 5, '2')], before)).toBe(0);
    expect(compareToLast([s('b', 60, 6, '2'), s('b', 60, 5, '2')], before)).toBe(1);
  });

  it('lists only real 1RM records, biggest gain first, at most three', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const session = { exercises: ids.map((exerciseId) => ({ exerciseId })) } as unknown as WorkoutSession;
    const exMap = new Map(ids.map((id) => [id, { id, name: id.toUpperCase(), measure: 'weight_reps' } as Exercise]));
    const prior = new Map(ids.map((id) => [id, [s('old', 100, 5, '1')]]));
    const now = [s('n', 100, 5, '2'), s('n', 102.5, 5, '2'), s('n', 110, 5, '2'), s('n', 105, 5, '2'), s('n', 107.5, 5, '2')].map((x, i) => ({ ...x, exerciseId: ids[i] }));
    const lines = recordLines(session, now, prior, exMap, 'kg');
    expect(lines.map((l) => l.exerciseId)).toEqual(['c', 'e', 'd']);
    expect(lines[0].text).toBe('C: uppskattat 1RM 128,3 kg (+10 %)');
  });
});
