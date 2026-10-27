import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildSchema, type DayPlan } from './CreateSchemaPage';

describe('buildSchema', () => {
  it('creates each built pass once and maps weekdays to it, keeping saved passes as they are', () => {
    const pass = { name: 'Bröst', categories: [], exercises: [], sets: {} };
    const plans: Record<number, DayPlan> = {
      0: { kind: 'new', key: 'k1', pass },
      2: { kind: 'saved', templateId: 'mine' },
      4: { kind: 'new', key: 'k1', pass }, // "Samma som måndag"
    };
    let n = 0;
    const { templates, weekdays } = buildSchema([4, 0, 2], plans, () => `t${++n}`, (p) => ({ id: 'x', name: p.name, notes: '', exercises: [] }));
    expect(templates.map((t) => t.id)).toEqual(['t1']);
    expect(weekdays).toEqual(['t1', null, 'mine', null, 't1', null, null]);
  });
});
