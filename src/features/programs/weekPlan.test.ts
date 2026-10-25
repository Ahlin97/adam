import { describe, expect, it } from 'vitest';
import { buildProgram, daysOf, recommendSplit, spreadOverWeek } from './weekPlan';

describe('week planner', () => {
  it('recommends a split for the number of days', () => {
    expect(recommendSplit(2)?.key).toBe('fullbody');
    expect(recommendSplit(3)?.key).toBe('fullbody');
    expect(recommendSplit(4)?.key).toBe('upperlower');
    expect(recommendSplit(5)?.key).toBe('ppl');
    expect(recommendSplit(1)?.key).toBe('fullbody');
    expect(recommendSplit(7)?.key).toBe('ppl');
  });

  it('spreads templates over the chosen days in week order', () => {
    expect(spreadOverWeek([4, 0, 2], ['A', 'B'])).toEqual(['A', null, 'B', null, 'A', null, null]);
    expect(daysOf(['A', null, 'B', null, null, null, 'C'])).toEqual([0, 2, 6]);
  });

  it('uses a rotation when the split does not fit the week evenly', () => {
    const p = buildProgram({ name: 'Helkropp', days: [0, 2, 4], templates: ['A', 'B'], custom: null }, 'p');
    expect(p).toMatchObject({ mode: 'rotation', rotation: ['A', 'B'], reminderDays: [true, false, true, false, true, false, false] });
  });

  it('pins passes to weekdays when it fits evenly', () => {
    const p = buildProgram({ name: '', days: [0, 1, 3, 4], templates: ['UA', 'LA', 'UB', 'LB'], custom: null }, 'p');
    expect(p).toMatchObject({ name: 'Min vecka', mode: 'weekdays', weekdays: ['UA', 'LA', null, 'UB', 'LB', null, null] });
  });

  it('keeps hand-edited days as they are', () => {
    const custom = [null, 'X', null, null, null, 'Y', null];
    const p = buildProgram({ name: 'Egen', days: [1, 5], templates: ['A', 'B', 'C'], custom }, 'p');
    expect(p).toMatchObject({ mode: 'weekdays', weekdays: custom, reminderDays: [false, true, false, false, false, true, false] });
  });
});
