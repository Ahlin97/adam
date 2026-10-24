import { describe, expect, it } from 'vitest';
import {
  defaultStepFor,
  epley1RM,
  formatNumber,
  formatWeight,
  isLowerBody,
  kgToUnit,
  newRecords,
  personalRecords,
  platesPerSide,
  roundToAvailable,
  unitToKg,
  weightStepFor,
} from './index.ts';
import { exercise, profile } from './fixtures.test-utils.ts';

describe('formatting', () => {
  it('Swedish decimal comma', () => {
    expect(formatWeight(82.5, 'kg')).toBe('82,5 kg');
    expect(formatWeight(80, 'kg')).toBe('80 kg');
    expect(formatWeight(1.25, 'kg')).toBe('1,25 kg');
    expect(formatWeight(72.5, 'kg', { withUnit: false })).toBe('72,5');
    expect(formatWeight(72.50000001, 'kg')).toBe('72,5 kg');
  });
  it('lb conversion rounded to 0,1', () => {
    expect(formatWeight(100, 'lb')).toBe('220,5 lb');
    expect(formatWeight(unitToKg(225, 'lb'), 'lb')).toBe('225 lb');
    expect(kgToUnit(0.45359237, 'lb')).toBeCloseTo(1, 10);
    expect(unitToKg(1, 'lb')).toBe(0.45359237);
    expect(kgToUnit(80, 'kg')).toBe(80);
  });
  it('formatNumber grouping and negatives', () => {
    expect(formatNumber(12450)).toBe('12 450');
    expect(formatNumber(1250)).toBe('1250');
    expect(formatNumber(-2.5)).toBe('-2,5');
    expect(formatNumber(102.333, 1)).toBe('102,3');
    expect(formatNumber(-0.001)).toBe('0');
  });
});

describe('steps', () => {
  it('defaults per equipment', () => {
    for (const m of ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower_back'] as const) expect(isLowerBody(m)).toBe(true);
    expect(isLowerBody('chest')).toBe(false);
    expect(defaultStepFor('barbell', true, profile)).toBe(5);
    expect(defaultStepFor('barbell', false, profile)).toBe(2.5);
    expect(defaultStepFor('dumbbell', false, profile)).toBe(2);
    expect(defaultStepFor('machine', false, profile)).toBe(5);
    expect(defaultStepFor('cable', false, profile)).toBe(5);
  });
  it('exercise override', () => {
    expect(weightStepFor(exercise({ primaryMuscle: 'quads' }), profile)).toBe(5);
    expect(weightStepFor(exercise({ weightStep: 1 }), profile)).toBe(1);
  });
});

describe('roundToAvailable', () => {
  const bar = exercise();
  it('barbell rounds to bar + plate pairs (nearest 2,5 with 1,25 plates)', () => {
    expect(roundToAvailable(72, bar, profile)).toBe(72.5);
    expect(roundToAvailable(80 * 0.9, bar, profile)).toBe(72.5);
    expect(roundToAvailable(81, bar, profile)).toBe(80);
    expect(roundToAvailable(10, bar, profile)).toBe(20);
    expect(roundToAvailable(81.25, bar, profile)).toBe(80); // tie → lighter
  });
  it('barbell without small plates', () => {
    const p = { ...profile, plates: [20, 10, 5] };
    expect(roundToAvailable(72.5, bar, p)).toBe(70);
    expect(roundToAvailable(76, bar, p)).toBe(80);
  });
  it('dumbbells use list when available, else step', () => {
    const db = exercise({ equipment: 'dumbbell' });
    expect(roundToAvailable(13.2, db, profile)).toBe(14);
    expect(roundToAvailable(13, db, profile)).toBe(12); // tie → lighter
    expect(roundToAvailable(13, db, { ...profile, dumbbells: [10, 12.5, 15] })).toBe(12.5);
  });
  it('kettlebells use list when available', () => {
    const kb = exercise({ equipment: 'kettlebell' });
    expect(roundToAvailable(18, kb, { ...profile, kettlebells: [8, 12, 16, 24] })).toBe(16);
    expect(roundToAvailable(18, kb, profile)).toBe(16);
  });
  it('machines/cables round to step multiples', () => {
    expect(roundToAvailable(47, exercise({ equipment: 'machine' }), profile)).toBe(45);
    expect(roundToAvailable(48, exercise({ equipment: 'cable' }), profile)).toBe(50);
    expect(roundToAvailable(-3, exercise({ equipment: 'cable' }), profile)).toBe(0);
  });
});

describe('platesPerSide', () => {
  it('greedy largest first', () => {
    expect(platesPerSide(102.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toEqual({
      perSide: [25, 15, 1.25],
      achievedTotal: 102.5,
      remainder: 0,
    });
  });
  it('reports remainder', () => {
    const r = platesPerSide(63, 20, [20, 10, 5, 2.5]);
    expect(r.perSide).toEqual([20]);
    expect(r.achievedTotal).toBe(60);
    expect(r.remainder).toBe(3);
  });
  it('target below bar', () => {
    expect(platesPerSide(15, 20, [20])).toEqual({ perSide: [], achievedTotal: 20, remainder: 0 });
  });
});

describe('records', () => {
  it('epley', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 0)).toBe(100);
    expect(epley1RM(90, 10)).toBe(120);
  });
  it('personalRecords ignores warmups', () => {
    const pr = personalRecords([
      { type: 'warmup', reps: 5, weight: 120 },
      { type: 'working', reps: 10, weight: 90 },
      { type: 'working', reps: 8, weight: 90 },
      { type: 'failure', reps: 3, weight: 100 },
    ]);
    expect(pr.heaviestWeight).toBe(100);
    expect(pr.best1RM).toBe(120);
    expect(pr.mostRepsAtWeight).toEqual({ '90': 10, '100': 3 });
    expect(personalRecords([])).toEqual({ heaviestWeight: null, best1RM: null, mostRepsAtWeight: {} });
  });
  it('newRecords', () => {
    const prior = [
      { type: 'working' as const, reps: 10, weight: 80 },
      { type: 'working' as const, reps: 5, weight: 90 },
    ];
    expect(newRecords(prior, [{ type: 'working', reps: 11, weight: 80 }])).toEqual({ heaviest: false, best1RM: true, repsAtWeight: [80] });
    expect(newRecords(prior, [{ type: 'working', reps: 1, weight: 92.5 }])).toEqual({ heaviest: true, best1RM: false, repsAtWeight: [] });
    expect(newRecords(prior, [{ type: 'working', reps: 6, weight: 85 }])).toMatchObject({ repsAtWeight: [85] });
    expect(newRecords([], [{ type: 'working', reps: 6, weight: 85 }])).toEqual({ heaviest: false, best1RM: false, repsAtWeight: [] });
  });
});
