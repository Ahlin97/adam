import { describe, expect, it } from 'vitest';
import type { Program } from '@/engine';
import { isBlankProgram, switchMode } from './ProgramEditPage';

const base: Program = {
  id: 'p',
  name: '5 × 5',
  mode: 'rotation',
  rotation: ['A', 'B'],
  weekdays: [null, null, null, null, null, null, null],
  reminderDays: [true, false, true, false, true, false, false],
};

describe('switchMode', () => {
  it('spreads the rotation over the reminder days when weekdays are empty', () => {
    expect(switchMode(base, 'weekdays').weekdays).toEqual(['A', null, 'B', null, 'A', null, null]);
  });

  it('falls back to Mon/Wed/Fri without reminder days', () => {
    const p = { ...base, reminderDays: [false, false, false, false, false, false, false] };
    expect(switchMode(p, 'weekdays').weekdays).toEqual(['A', null, 'B', null, 'A', null, null]);
  });

  it('keeps weekdays that are already filled in', () => {
    const p = { ...base, weekdays: [null, 'B', null, null, null, null, null] };
    expect(switchMode(p, 'weekdays').weekdays).toEqual(p.weekdays);
  });

  it('builds a rotation from the weekday passes in week order', () => {
    const p: Program = { ...base, mode: 'weekdays', rotation: [], weekdays: ['A', null, 'B', null, 'C', null, null] };
    expect(switchMode(p, 'rotation').rotation).toEqual(['A', 'B', 'C']);
  });

  it('only changes mode for an empty program', () => {
    const p: Program = { ...base, name: '', rotation: [] };
    expect(switchMode(p, 'weekdays')).toEqual({ ...p, mode: 'weekdays' });
    expect(isBlankProgram(switchMode(p, 'weekdays'))).toBe(true);
  });
});
