import { describe, expect, it } from 'vitest';
import { BUILTIN_EXERCISES as EXERCISES } from '@/data/exercises';
import { compareExercises, groupByRegion, regionOf } from './filters';

describe('exercise grouping', () => {
  it('groups every built-in exercise under a region, in body order', () => {
    const groups = groupByRegion(EXERCISES);
    expect(groups.map((g) => g.label)).toEqual(['Bröst', 'Rygg', 'Axlar', 'Armar', 'Ben & säte', 'Mage', 'Helkropp'].filter((l) => groups.some((g) => g.label === l)));
    expect(groups.reduce((n, g) => n + g.exercises.length, 0)).toBe(EXERCISES.length);
  });

  it('puts free weights before machines and cables within the same muscle', () => {
    const chest = groupByRegion(EXERCISES).find((g) => g.key === 'chest')!.exercises.filter((e) => e.primaryMuscle === 'chest');
    const order = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'];
    const idx = chest.map((e) => order.indexOf(e.equipment));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('maps related muscles to one region', () => {
    expect(regionOf('lats')).toBe('back');
    expect(regionOf('triceps')).toBe('arms');
    expect(regionOf('glutes')).toBe('legs');
    expect(regionOf('obliques')).toBe('core');
  });

  it('is a stable total order', () => {
    const sorted = [...EXERCISES].sort(compareExercises);
    expect([...sorted].reverse().sort(compareExercises)).toEqual(sorted);
  });
});
