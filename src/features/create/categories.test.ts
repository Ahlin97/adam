import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_EXERCISES } from '@/data/exercises';
import { DEFAULT_SETTINGS } from '@/db/repo';
import { EQUIPMENT_GROUPS, exercisesByCategory, makeCustomExercise, makeTemplate, passName } from './categories';

describe('create pass building blocks', () => {
  it('names a pass after its categories in display order', () => {
    expect(passName(['chest'])).toBe('Bröst');
    expect(passName(['chest', 'arms'])).toBe('Armar & Bröst');
    expect(passName(['shoulders', 'back', 'arms'])).toBe('Armar, Rygg & Axlar');
    expect(passName([])).toBe('Mitt pass');
  });

  it('lists exercises for the chosen categories only, filterable by equipment', () => {
    const groups = exercisesByCategory(BUILTIN_EXERCISES, ['legs', 'chest'], null);
    expect(groups.map((g) => g.category.label)).toEqual(['Ben', 'Bröst']);
    expect(groups.flatMap((g) => g.exercises).some((e) => e.id === 'bi-squat')).toBe(true);
    expect(groups.flatMap((g) => g.exercises).some((e) => e.id === 'bi-barbell-curl')).toBe(false);
    const machines = exercisesByCategory(BUILTIN_EXERCISES, ['legs'], EQUIPMENT_GROUPS[0]);
    expect(machines[0].exercises.every((e) => e.equipment === 'machine')).toBe(true);
    expect(machines[0].exercises.some((e) => e.id === 'bi-leg-press')).toBe(true);
  });

  it('creates custom exercises and a pass from the picks', () => {
    const ex = makeCustomExercise({ name: '  Smith-press ', muscle: 'chest', equipment: 'machine' });
    expect(ex).toMatchObject({ name: 'Smith-press', primaryMuscle: 'chest', isCustom: true, measure: 'weight_reps' });
    const t = makeTemplate('', [ex], DEFAULT_SETTINGS);
    expect(t.name).toBe('Mitt pass');
    expect(t.exercises).toHaveLength(1);
    expect(t.exercises[0]).toMatchObject({ exerciseId: ex.id, sets: 3, warmupSets: 0 });
    expect(makeTemplate('X', [ex], DEFAULT_SETTINGS, { [ex.id]: 5 }).exercises[0].sets).toBe(5);
  });

  it('has Mage as a category with the ab exercises', () => {
    const core = exercisesByCategory(BUILTIN_EXERCISES, ['core'], null);
    expect(core[0].category.label).toBe('Mage');
    expect(core[0].exercises.some((e) => e.id === 'bi-plank')).toBe(true);
    expect(passName(['chest', 'core'])).toBe('Bröst & Mage');
  });
});
