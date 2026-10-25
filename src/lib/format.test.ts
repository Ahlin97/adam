import { describe, expect, it } from 'vitest';
import { formatSessionLength } from './format';

describe('formatSessionLength', () => {
  it('reads like words, not a timer', () => {
    expect(formatSessionLength(35)).toBe('under 1 min');
    expect(formatSessionLength(45 * 60 + 20)).toBe('45 min');
    expect(formatSessionLength(60 * 60)).toBe('1 h');
    expect(formatSessionLength(65 * 60 + 12)).toBe('1 h 5 min');
  });
});
