// Deno tests for the watch API logic: `deno test supabase/functions/watch/` (after `npm run engine:sync`).
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import type { Exercise, Program, SetEntry, WorkoutSession, WorkoutTemplate } from '../_shared/engine/index.ts';
import {
  ApiError,
  buildHistories,
  describeLogged,
  describeNext,
  describeToday,
  finishSession,
  localDayKey,
  makeSetEntry,
  mergeSettings,
  parseLogInput,
  parseNumber,
  pickActiveSession,
  planToday,
  resolveAction,
  sha256Hex,
  startSession,
  targetSet,
} from './logic.ts';

const bench: Exercise = {
  id: 'bench',
  name: 'Bänkpress',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  category: 'compound',
  measure: 'weight_reps',
  unilateral: false,
  bodyweightMode: 'none',
  weightStep: null,
  notes: '',
  isCustom: false,
  isFavorite: false,
};
const plank: Exercise = { ...bench, id: 'plank', name: 'Planka', measure: 'time', equipment: 'bodyweight', primaryMuscle: 'abs' };
const exercises = new Map([bench, plank].map((e) => [e.id, e]));
const settings = mergeSettings(null);

const template: WorkoutTemplate = {
  id: 'push',
  name: 'Push',
  notes: '',
  exercises: [
    { id: 'te1', exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double', supersetGroup: null, notes: '' },
    { id: 'te2', exerciseId: 'plank', sets: 2, repMin: 30, repMax: 60, targetRpe: null, restSec: 60, warmupSets: 0, rule: 'double', supersetGroup: null, notes: '' },
  ],
};

const prevSession: WorkoutSession = {
  id: 'prev',
  name: 'Push',
  templateId: 'push',
  programId: 'prog',
  status: 'completed',
  startedAt: '2026-10-20T16:00:00.000Z',
  endedAt: '2026-10-20T17:00:00.000Z',
  notes: '',
  exercises: [{ id: 'se-prev', exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12, targetRpe: null, restSec: 120, warmupSets: 0, rule: 'double', supersetGroup: null, notes: '', suggestion: null }],
};
const prevSets: SetEntry[] = [0, 1, 2].map((i) => ({
  id: `p${i}`,
  sessionId: 'prev',
  sessionExerciseId: 'se-prev',
  exerciseId: 'bench',
  order: i,
  type: 'working',
  reps: 12,
  weight: 80,
  durationSec: null,
  rpe: null,
  completedAt: '2026-10-20T16:10:00.000Z',
}));

let n = 0;
const newId = () => `id${++n}`;
const now = new Date('2026-10-24T10:00:00.000Z');

function started(): WorkoutSession {
  const histories = buildHistories(['bench', 'plank'], [prevSession], prevSets);
  return startSession({ id: 's1', newId, template, program: null, exercises, histories, settings, now });
}

Deno.test('parseNumber accepts Swedish decimals and strings', () => {
  assertEquals(parseNumber('82,5'), 82.5);
  assertEquals(parseNumber(' 8 '), 8);
  assertEquals(parseNumber('82.5 kg'), 82.5);
  assertEquals(parseNumber(''), null);
  assertEquals(parseNumber(undefined), null);
  assert(Number.isNaN(parseNumber('abc')));
});

Deno.test('parseLogInput validates', () => {
  assertEquals(parseLogInput({ reps: '8', weight: '82,5' }), { reps: 8, weight: 82.5, rpe: null, sessionExerciseId: null });
  assertThrows(() => parseLogInput({ reps: 'x' }), ApiError);
  assertThrows(() => parseLogInput({ reps: 8.5 }), ApiError);
  assertThrows(() => parseLogInput({ reps: 8, rpe: 11 }), ApiError);
});

Deno.test('resolveAction from path and query', () => {
  assertEquals(resolveAction(new URL('https://x.supabase.co/functions/v1/watch/next')), 'next');
  assertEquals(resolveAction(new URL('https://x/watch/log')), 'log');
  assertEquals(resolveAction(new URL('https://x/watch')), 'next');
  assertEquals(resolveAction(new URL('https://x/watch?action=finish')), 'finish');
  assertEquals(resolveAction(new URL('https://x/watch/bogus')), null);
});

Deno.test('histories: completed sessions only, newest first', () => {
  const active = { ...prevSession, id: 'act', status: 'active' as const };
  const h = buildHistories(['bench'], [prevSession, active], [...prevSets, { ...prevSets[0], id: 'a1', sessionId: 'act' }]);
  assertEquals(h.get('bench')!.length, 1);
  assertEquals(h.get('bench')![0].sets.length, 3);
});

Deno.test('next set uses progression (12/12/12 @ 80 → 82,5 kg × 8)', () => {
  const s = started();
  const r = describeNext(s, [], exercises, settings);
  assertEquals(r.done, false);
  assertEquals(r.exercise, 'Bänkpress');
  assertEquals(r.weight, 82.5);
  assertEquals(r.reps, 8);
  assertEquals(r.weightText, '82,5 kg');
  assertEquals(r.text, 'Bänkpress – set 1 av 3: 8 × 82,5 kg');
  assertEquals(r.restText, '2:00');
});

Deno.test('lb settings convert weights', () => {
  const s = started();
  const r = describeNext(s, [], exercises, mergeSettings({ unit: 'lb' }));
  assertEquals(r.unit, 'lb');
  assertEquals(r.weightKg, 82.5);
  assertEquals(r.weight, 181.88);
  assert(r.text.endsWith('lb'));
});

Deno.test('log flow: logs sets, then moves to next exercise, then done', () => {
  const s = started();
  const sets: SetEntry[] = [];
  for (let i = 0; i < 3; i++) {
    const target = targetSet(s, sets, null, exercises, settings);
    const entry = makeSetEntry({
      id: `x${i}`,
      session: s,
      sets,
      target,
      input: parseLogInput({ reps: '8' }),
      exercise: exercises.get(target.exerciseId),
      unit: settings.unit,
      now,
    });
    assertEquals(entry.weight, 82.5);
    assertEquals(entry.order, i);
    sets.push(entry);
    const res = describeLogged(entry, s, sets, exercises, settings, target.restSec);
    if (i < 2) assertEquals(res.text, `Loggat: Bänkpress 8 × 82,5 kg. Vila 2:00. Nästa: Bänkpress – set ${i + 2} av 3: 8 × 82,5 kg`);
    else assert(res.text.includes('Nästa: Planka – set 1 av 2: 30 s'), res.text);
  }
  // time exercise
  for (let i = 0; i < 2; i++) {
    const target = targetSet(s, sets, null, exercises, settings);
    const entry = makeSetEntry({ id: `t${i}`, session: s, sets, target, input: parseLogInput({ reps: 45 }), exercise: plank, unit: 'kg', now });
    assertEquals(entry.durationSec, 45);
    assertEquals(entry.weight, 0);
    sets.push(entry);
  }
  const done = describeNext(s, sets, exercises, settings);
  assertEquals(done.done, true);
  assertEquals(done.text, 'Alla set klara! Avsluta passet?');
  assertThrows(() => targetSet(s, sets, null, exercises, settings), ApiError);
});

Deno.test('explicit weight in lb is stored in kg; first time requires weight', () => {
  const s = started();
  const target = targetSet(s, [], null, exercises, settings);
  const e = makeSetEntry({ id: 'a', session: s, sets: [], target, input: parseLogInput({ reps: 8, weight: '100' }), exercise: bench, unit: 'lb', now });
  assertEquals(e.weight, 45.36);
  const fresh = startSession({ id: 's2', newId, template, program: null, exercises, histories: new Map(), settings, now });
  const t2 = targetSet(fresh, [], null, exercises, settings);
  assertEquals(t2.weight, null);
  assertThrows(() => makeSetEntry({ id: 'b', session: fresh, sets: [], target: t2, input: parseLogInput({ reps: 8 }), exercise: bench, unit: 'kg', now }), ApiError);
  assert(describeNext(fresh, [], exercises, settings).text.includes('ange startvikt'));
});

Deno.test('targetSet for a named session exercise', () => {
  const s = started();
  const plankSe = s.exercises[1];
  const t = targetSet(s, [], plankSe.id, exercises, settings);
  assertEquals(t.exerciseId, 'plank');
  assertThrows(() => targetSet(s, [], 'nope', exercises, settings), ApiError);
});

const program: Program = {
  id: 'prog',
  name: 'P',
  mode: 'weekdays',
  weekdays: ['push', null, 'push', null, 'push', null, null],
  rotation: [],
  reminderDays: [false, false, false, false, false, false, false],
};

Deno.test('planToday: weekdays, rest day, override, already done, timezone', () => {
  const s = mergeSettings({ activeProgramId: 'prog' });
  // 2026-10-24 is a Saturday → rest day
  assertEquals(planToday({ settings: s, programs: [program], templates: [template], completed: [], now, tz: 'Europe/Stockholm' }).kind, 'rest');
  // Monday 2026-10-26
  const mon = new Date('2026-10-26T06:00:00Z');
  const p = planToday({ settings: s, programs: [program], templates: [template], completed: [], now: mon, tz: 'Europe/Stockholm' });
  assertEquals(p.kind, 'train');
  // Sunday 23:30 UTC = Monday 00:30 in Stockholm (CET after DST end)
  const lateSun = new Date('2026-10-25T23:30:00Z');
  assertEquals(planToday({ settings: s, programs: [program], templates: [template], completed: [], now: lateSun, tz: 'Europe/Stockholm' }).kind, 'train');
  assertEquals(planToday({ settings: s, programs: [program], templates: [template], completed: [], now: lateSun, tz: 'UTC' }).kind, 'rest');
  // override on rest day
  assertEquals(planToday({ settings: s, programs: [program], templates: [template], completed: [], now, tz: 'Europe/Stockholm', templateId: 'Push' }).kind, 'train');
  // already done today
  const doneToday = { ...prevSession, startedAt: '2026-10-26T05:00:00Z' };
  assertEquals(planToday({ settings: s, programs: [program], templates: [template], completed: [doneToday], now: mon, tz: 'Europe/Stockholm' }).kind, 'already_done');
  // no program
  assertEquals(planToday({ settings, programs: [], templates: [], completed: [], now, tz: 'UTC' }).kind, 'no_program');
});

Deno.test('rotation picks the template after the last completed one', () => {
  const pull: WorkoutTemplate = { ...template, id: 'pull', name: 'Pull' };
  const rot: Program = { ...program, mode: 'rotation', rotation: ['push', 'pull'] };
  const p = planToday({ settings: mergeSettings({ activeProgramId: 'prog' }), programs: [rot], templates: [template, pull], completed: [prevSession], now, tz: 'Europe/Stockholm' });
  assertEquals(p.kind === 'train' && p.template.id, 'pull');
});

Deno.test('finish, today, active session, misc', async () => {
  const s = started();
  const f = finishSession(s, new Date('2026-10-24T11:00:00Z'));
  assertEquals(f.status, 'completed');
  assertEquals(f.endedAt, '2026-10-24T11:00:00.000Z');
  assertEquals(pickActiveSession([f, s, { ...s, id: 'older', startedAt: '2026-01-01T00:00:00Z' }])!.id, 's1');
  const t = describeToday({ active: s, activeSets: [], plan: null, exercises, settings });
  assert(t.text.startsWith('Pågående pass: Push – 2 övningar, 0 av 5 set klara.'), t.text);
  assertEquals(localDayKey('2026-10-24T22:30:00Z', 'Europe/Stockholm'), '2026-10-25');
  assertEquals(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
