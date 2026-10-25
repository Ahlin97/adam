import { describe, expect, it } from 'vitest';
import type { Program } from '@/engine';
import { mondayOf, weekProgress } from './weekProgress';

const program: Program = {
  id: 'p',
  name: 'Över/under',
  mode: 'weekdays',
  rotation: [],
  weekdays: ['UA', 'LA', null, 'UB', 'LB', null, null],
  reminderDays: [true, true, false, true, true, false, false],
};
const at = (iso: string) => ({ startedAt: new Date(iso).toISOString() });
// Thursday 29 Oct 2026
const today = new Date(2026, 9, 29, 18, 0);

describe('weekProgress', () => {
  it('finds Monday of the week', () => {
    expect(mondayOf(today)).toEqual(new Date(2026, 9, 26));
    expect(mondayOf(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 26)); // Sunday belongs to the same week
  });

  it('counts this week against the program goal and marks trained days', () => {
    const p = weekProgress(program, [at('2026-10-26T17:00'), at('2026-10-27T17:00'), at('2026-10-20T17:00')], today);
    expect(p.goal).toBe(4);
    expect(p.done).toBe(2);
    expect(p.trained).toEqual([true, true, false, false, false, false, false]);
    expect(p.planned).toEqual([true, true, false, true, true, false, false]);
  });

  it('counts consecutive weeks where the goal was met', () => {
    const week = (monday: string) => [0, 1, 3, 4].map((d) => at(new Date(new Date(monday).getTime() + d * 864e5 + 17 * 36e5).toISOString()));
    const completed = [...week('2026-10-19T00:00'), ...week('2026-10-12T00:00'), at('2026-10-05T17:00')];
    expect(weekProgress(program, completed, today).streak).toBe(2);
    // Reaching the goal this week adds it to the streak.
    expect(weekProgress(program, [...completed, ...week('2026-10-26T00:00')], today).streak).toBe(3);
  });

  it('has no goal without a program', () => {
    const p = weekProgress(undefined, [at('2026-10-27T17:00')], today);
    expect(p).toMatchObject({ goal: null, done: 1, streak: 0 });
  });
});
