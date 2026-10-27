import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '@/engine';
import { groupByWeek } from './HistoryPage';

const s = (id: string, d: Date) => ({ id, startedAt: d.toISOString() }) as WorkoutSession;

describe('groupByWeek', () => {
  it('groups newest week first with readable titles', () => {
    const now = new Date(2026, 9, 29, 12); // Thursday, week 44
    const groups = groupByWeek([s('a', new Date(2026, 9, 26, 18)), s('b', new Date(2026, 9, 21, 18)), s('c', new Date(2026, 9, 28, 18)), s('d', new Date(2026, 9, 5, 18))], now);
    expect(groups.map((g) => g.title)).toEqual(['Den här veckan', 'Förra veckan', 'v. 41']);
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['c', 'a']);
  });
});
