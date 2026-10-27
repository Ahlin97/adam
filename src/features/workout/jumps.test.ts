import { describe, expect, it } from 'vitest';
import { weightJumps } from './inputs';

describe('weightJumps', () => {
  it('fits the equipment', () => {
    expect(weightJumps('machine', 5, 'kg')).toEqual([-10, -5, 5, 10]);
    expect(weightJumps('dumbbell', 2, 'kg')).toEqual([-4, -2, 2, 4]);
    expect(weightJumps('other', 2.5, 'kg')).toEqual([-10, -5, 5, 10]);
    expect(weightJumps('machine', 5, 'lb')).toEqual([-40, -20, 20, 40]);
  });
});
