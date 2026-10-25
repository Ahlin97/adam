import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { platesText } from './PlateCalculator';

describe('platesText', () => {
  it('groups equal plates', () => {
    expect(platesText([20, 20, 5, 1.25])).toBe('2 × 20 + 5 + 1,25');
    expect(platesText([10])).toBe('10');
    expect(platesText([])).toBe('');
  });
});
