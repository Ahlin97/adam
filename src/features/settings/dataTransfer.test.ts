import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_EXERCISES } from '@/data/exercises';
import type { Exercise, SetEntry, WorkoutSession } from '@/engine/types.ts';
import {
  buildExportBundle,
  commitImport,
  normalizeName,
  parseCsv,
  parseImportCsv,
  parseJsonBackup,
  parseLooseDate,
  planCsvImport,
  planJsonImport,
  setsToCsv,
  summarizePlan,
  toCsv,
} from './dataTransfer';
import { all } from '@/db/repo';

const ex = (id: string, name: string): Exercise => ({
  id,
  name,
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
  category: 'compound',
  measure: 'weight_reps',
  unilateral: false,
  bodyweightMode: 'none',
  weightStep: null,
  notes: '',
  isCustom: false,
  isFavorite: false,
});

const existing = [ex('bench', 'Bänkpress'), ex('squat', 'Knäböj'), ex('row', 'Skivstångsrodd')];

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, newlines in fields, CRLF and BOM', () => {
    const text = '﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n2,"multi\nline",\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'he said "hi"'],
      ['2', 'multi\nline', ''],
    ]);
  });
  it('detects semicolons', () => {
    expect(parseCsv('a;b\n"1,5";2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });
  it('round-trips toCsv', () => {
    const rows = [['a', 'b,c', 'd"e', 'f\ng', ' x']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('helpers', () => {
  it('normalizes names case/diacritic-insensitively', () => {
    expect(normalizeName('  Bänkpress ')).toBe(normalizeName('BANKPRESS'));
    expect(normalizeName('Bench Press (Barbell)')).toBe('bench press barbell');
  });
  it('parses loose dates', () => {
    expect(parseLooseDate('2023-01-15 08:30:00')?.getTime()).toBe(new Date(2023, 0, 15, 8, 30).getTime());
    expect(parseLooseDate('15 Jan 2023, 08:30')?.getTime()).toBe(new Date(2023, 0, 15, 8, 30).getTime());
    expect(parseLooseDate('2023-01-15T08:30:00.000Z')?.toISOString()).toBe('2023-01-15T08:30:00.000Z');
    expect(parseLooseDate('nonsense')).toBeNull();
  });
});

describe('Strong import', () => {
  const strong = [
    '"Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Reps","Distance","Seconds","Notes","Workout Notes","RPE"',
    '"2023-01-15 08:30:00","Push","1h 5m","Bench Press (Barbell)","W","40","10","0","0","","",""',
    '"2023-01-15 08:30:00","Push","1h 5m","Bench Press (Barbell)","1","80","8","0","0","","","8"',
    '"2023-01-15 08:30:00","Push","1h 5m","Bench Press (Barbell)","2","80","7","0","0","","",""',
    '"2023-01-15 08:30:00","Push","1h 5m","Knaboj","1","100","5","0","0","","",""',
    '"2023-01-15 08:30:00","Push","1h 5m","Plank","1","0","0","0","60","","",""',
    '"2023-01-17 18:00:00","Pull","45m","Bench Press (Barbell)","1","82.5","8","0","0","","",""',
    '"2023-01-17 18:00:00","Pull","45m","Bench Press (Barbell)","Rest Timer","0","0","0","90","","",""',
  ].join('\n');

  it('parses and plans sessions', () => {
    const parsed = parseImportCsv(strong, 'kg');
    expect(parsed.format).toBe('strong');
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.skipped).toBe(1);
    expect(parsed.rows[0].type).toBe('warmup');
    const plan = planCsvImport(parsed, existing);
    expect(plan.sessions).toHaveLength(2);
    expect(plan.sets).toHaveLength(6);
    // "Knaboj" matches Knäböj; bench press and plank are new.
    expect(plan.newExerciseNames.sort()).toEqual(['Bench Press (Barbell)', 'Plank']);
    expect(plan.exercises.find((e) => e.name === 'Plank')?.measure).toBe('time');
    expect(plan.exercises[0]).toMatchObject({ equipment: 'other', primaryMuscle: 'full_body', isCustom: true });
    const push = plan.sessions[0];
    expect(push).toMatchObject({ name: 'Push', status: 'completed' });
    expect(push.exercises).toHaveLength(3);
    expect(push.exercises[0]).toMatchObject({ sets: 2, warmupSets: 1, repMin: 7, repMax: 8 });
    expect(new Date(push.endedAt!).getTime() - new Date(push.startedAt).getTime()).toBe(65 * 60_000);
    expect(plan.sets.find((s) => s.exerciseId === 'squat')).toMatchObject({ weight: 100, reps: 5 });
    // Same bench exercise id used in both sessions.
    const benchIds = new Set(plan.sets.filter((s) => s.weight >= 80 && s.exerciseId !== 'squat').map((s) => s.exerciseId));
    expect(benchIds.size).toBe(1);
    expect(summarizePlan(plan)).toBe('2 pass, 6 set, 2 nya övningar');
  });

  it('is deterministic so re-import does not duplicate', () => {
    const a = planCsvImport(parseImportCsv(strong), existing);
    const b = planCsvImport(parseImportCsv(strong), existing);
    expect(a.sessions.map((s) => s.id)).toEqual(b.sessions.map((s) => s.id));
    expect(a.sets.map((s) => s.id)).toEqual(b.sets.map((s) => s.id));
  });

  it('maps English Strong names to built-in exercises', () => {
    const plan = planCsvImport(parseImportCsv(strong, 'kg'), BUILTIN_EXERCISES);
    const ids = new Set(plan.sets.map((s) => s.exerciseId));
    expect(ids.has('bi-bench-press')).toBe(true);
    expect(ids.has('bi-plank')).toBe(true);
    // Only "Knaboj" is unknown here: the Swedish built-in is "Knäböj", which matches diacritic-insensitively.
    expect(plan.newExerciseNames).toEqual([]);
  });

  it('converts lb', () => {
    const csv = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2023-01-15 08:30:00,A,Knäböj,1,225,5';
    expect(parseImportCsv(csv, 'lb').rows[0].weightKg).toBeCloseTo(102.06, 2);
  });
});

describe('Hevy import', () => {
  it('parses Hevy export', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      '"Ben","15 Jan 2023, 08:30","15 Jan 2023, 09:30","","Squat (Barbell)","","djup",0,warmup,60,5,,,',
      '"Ben","15 Jan 2023, 08:30","15 Jan 2023, 09:30","","Squat (Barbell)","","",1,normal,100,5,,,8.5',
      '"Ben","15 Jan 2023, 08:30","15 Jan 2023, 09:30","","Skivstångsrodd","","",0,dropset,50,10,,,',
    ].join('\n');
    const parsed = parseImportCsv(csv);
    expect(parsed.format).toBe('hevy');
    const plan = planCsvImport(parsed, existing);
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].endedAt).toBe(new Date(2023, 0, 15, 9, 30).toISOString());
    expect(plan.sets.map((s) => s.type)).toEqual(['warmup', 'working', 'drop']);
    expect(plan.sets[1].rpe).toBe(8.5);
    expect(plan.sets[2].exerciseId).toBe('row');
    expect(plan.sessions[0].exercises[0].notes).toBe('djup');
  });
});

describe('own CSV round trip', () => {
  const session: WorkoutSession = {
    id: 's1',
    name: 'Push, "tung"',
    templateId: null,
    programId: null,
    status: 'completed',
    startedAt: '2026-10-01T08:00:00.000Z',
    endedAt: '2026-10-01T09:00:00.000Z',
    notes: '',
    exercises: [{ id: 'se1', exerciseId: 'bench', supersetGroup: null, notes: 'bra', suggestion: null, sets: 2, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double' }],
  };
  const sets: SetEntry[] = [
    { id: 'x1', sessionId: 's1', sessionExerciseId: 'se1', exerciseId: 'bench', order: 0, type: 'working', reps: 10, weight: 82.5, durationSec: null, rpe: 8, completedAt: '' },
    { id: 'x2', sessionId: 's1', sessionExerciseId: 'se1', exerciseId: 'bench', order: 1, type: 'failure', reps: 7, weight: 82.5, durationSec: null, rpe: null, completedAt: '' },
  ];

  it('exports with BOM and header, and re-imports to the same ids', () => {
    const csv = setsToCsv([session], sets, new Map([['bench', { name: 'Bänkpress' }]]));
    expect(csv.startsWith('﻿date,session,exercise,set_order,set_type,weight_kg,reps,rpe,duration_sec,notes')).toBe(true);
    expect(csv).toContain('"Push, ""tung"""');
    const parsed = parseImportCsv(csv);
    expect(parsed.format).toBe('gymlogg');
    const plan = planCsvImport(parsed, existing);
    expect(plan.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(plan.sets.map((s) => [s.id, s.type, s.weight, s.reps, s.rpe])).toEqual([
      ['x1', 'working', 82.5, 10, 8],
      ['x2', 'failure', 82.5, 7, null],
    ]);
    expect(plan.exercises).toHaveLength(0);
  });
});

describe('JSON backup', () => {
  it('validates and commits via putMany', async () => {
    const bundle = buildExportBundle(
      { exercises: [ex('e1', 'Test')], templates: [], programs: [], sessions: [], sets: [], settings: null },
      new Date('2026-10-24T10:00:00Z'),
    );
    expect(bundle).toMatchObject({ app: 'gymlogg', version: 1, exportedAt: '2026-10-24T10:00:00.000Z' });
    const parsed = parseJsonBackup(JSON.stringify(bundle));
    await commitImport(planJsonImport(parsed));
    expect((await all('exercises')).map((e) => e.id)).toContain('e1');
    expect(() => parseJsonBackup('{"app":"other"}')).toThrow(/Gymlogg/);
    expect(() => parseJsonBackup('nope')).toThrow(/JSON/);
  });
});
