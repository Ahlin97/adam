import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@/engine';
import { compareToLast, lastTimeSets } from './SummaryPage';

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
});
