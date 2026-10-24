import { describe, expect, it } from 'vitest';
import { isPlateau, referenceWeight, suggestNext } from './index.ts';
import { NOW, entry, exercise, profile, rx } from './fixtures.test-utils.ts';

const bench = exercise({ weightStep: 2.5 });
const squat = exercise({ id: 'sq', name: 'Knäböj', primaryMuscle: 'quads', weightStep: 5 });
const fiveByFive = rx({ sets: 5, repMin: 5, repMax: 5, rule: 'linear' });

describe('acceptance tests (SPEC §4)', () => {
  it('8–12, step 2,5, 12/12/12 @ 80 → 3 × 8 @ 82,5', () => {
    const s = suggestNext(bench, rx(), [entry(3, 80, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'increase', weight: 82.5, reps: 8, sets: 3, readyToIncrease: true });
    expect(s.reason).toBe('↑ Höj till 82,5 kg – du klarade 3 × 12 förra passet');
  });

  it('12/11/10 @ 80 → 80 kg, more reps', () => {
    const s = suggestNext(bench, rx(), [entry(3, 80, [12, 11, 10])], profile, NOW);
    expect(s).toMatchObject({ kind: 'more_reps', weight: 80, reps: 11, readyToIncrease: false });
    expect(s.reason).toBe('→ Behåll 80 kg – sikta på fler reps (12/11/10)');
  });

  it('three sessions in a row with a set under 8 @ 80 → 72,5 kg', () => {
    const h = [entry(2, 80, [9, 8, 7]), entry(5, 80, [8, 7, 6]), entry(9, 80, [10, 8, 7])];
    const s = suggestNext(bench, rx(), h, profile, NOW);
    expect(s).toMatchObject({ kind: 'deload', weight: 72.5, reps: 8 });
    expect(s.reason).toBe('↓ Deload till 72,5 kg – tre pass i rad under 8 reps');
  });

  it('5 × 5, step 5, all done @ 100 → 5 × 5 @ 105', () => {
    const s = suggestNext(squat, fiveByFive, [entry(3, 100, [5, 5, 5, 5, 5], { prescription: fiveByFive })], profile, NOW);
    expect(s).toMatchObject({ kind: 'increase', weight: 105, reps: 5, sets: 5 });
    expect(s.reason).toBe('↑ Höj till 105 kg – du klarade 5 × 5 förra passet');
  });

  it('5 × 5 @ 100 with one set of 4 → 100 again', () => {
    const s = suggestNext(squat, fiveByFive, [entry(3, 100, [5, 5, 4, 5, 5], { prescription: fiveByFive })], profile, NOW);
    expect(s).toMatchObject({ kind: 'repeat', weight: 100, reps: 5, readyToIncrease: false });
  });
});

describe('double progression details', () => {
  it('one or two misses at same weight → repeat, not deload', () => {
    const h = [entry(2, 80, [9, 8, 7]), entry(5, 80, [8, 7, 6])];
    expect(suggestNext(bench, rx(), h, profile, NOW)).toMatchObject({ kind: 'repeat', weight: 80, reps: 8 });
  });

  it('misses at a different weight break the streak', () => {
    const h = [entry(2, 80, [9, 8, 7]), entry(5, 80, [8, 7, 6]), entry(9, 77.5, [10, 8, 7])];
    expect(suggestNext(bench, rx(), h, profile, NOW).kind).toBe('repeat');
  });

  it('only working sets count; warmups and drop sets are ignored', () => {
    const e = entry(3, 80, [12, 12, 12]);
    e.sets.unshift({ type: 'warmup', reps: 5, weight: 40, rpe: null, durationSec: null });
    e.sets.push({ type: 'drop', reps: 4, weight: 60, rpe: null, durationSec: null });
    expect(suggestNext(bench, rx(), [e], profile, NOW).kind).toBe('increase');
  });

  it('reference weight is the most common working weight (ties → heaviest)', () => {
    const e = entry(3, 80, [12, 12]);
    e.sets.push({ type: 'working', reps: 6, weight: 70, rpe: null, durationSec: null });
    expect(referenceWeight(e)).toBe(80);
    // back-off set at 70 is ignored
    expect(suggestNext(bench, rx({ sets: 2 }), [e], profile, NOW).kind).toBe('increase');
    const tie = entry(3, 80, [10]);
    tie.sets.push({ type: 'working', reps: 10, weight: 85, rpe: null, durationSec: null });
    expect(referenceWeight(tie)).toBe(85);
  });

  it('history order does not matter (sorted by date)', () => {
    const h = [entry(9, 80, [10, 8, 7]), entry(2, 80, [9, 8, 7]), entry(5, 80, [8, 7, 6])];
    expect(suggestNext(bench, rx(), h, profile, NOW).kind).toBe('deload');
  });

  it('more_reps target is capped at repMax', () => {
    expect(suggestNext(bench, rx(), [entry(3, 80, [12, 12, 11])], profile, NOW).reps).toBe(12);
  });
});

describe('RPE gate', () => {
  it('avg RPE > 9 blocks the increase', () => {
    const s = suggestNext(bench, rx(), [entry(3, 80, [12, 12, 12], { rpe: [9, 9.5, 10] })], profile, NOW);
    expect(s).toMatchObject({ kind: 'repeat', weight: 80, readyToIncrease: false });
    expect(s.reason).toContain('RPE 9,5');
  });
  it('avg RPE ≤ 9 allows the increase', () => {
    const s = suggestNext(bench, rx(), [entry(3, 80, [12, 12, 12], { rpe: [8, 9, 10] })], profile, NOW);
    expect(s.kind).toBe('increase');
  });
  it('sets without RPE are ignored in the average', () => {
    const s = suggestNext(bench, rx(), [entry(3, 80, [12, 12, 12], { rpe: [8, null, null] })], profile, NOW);
    expect(s.kind).toBe('increase');
  });
});

describe('big step rule (> 10 %)', () => {
  const curl = exercise({ id: 'curl', name: 'Hantelcurl', equipment: 'dumbbell', primaryMuscle: 'biceps' });
  it('double: 12 kg dumbbell, step 2 → needs repMax + 2', () => {
    const s = suggestNext(curl, rx(), [entry(3, 12, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'more_reps', weight: 12, reps: 13 });
    expect(s.reason).toContain('14 reps krävs');
    const s2 = suggestNext(curl, rx(), [entry(3, 12, [14, 14, 14])], profile, NOW);
    expect(s2).toMatchObject({ kind: 'increase', weight: 14, reps: 8 });
  });
  it('linear: needs two successful sessions in a row at the same weight', () => {
    const p = rx({ sets: 3, repMin: 10, repMax: 10, rule: 'linear' });
    const one = suggestNext(curl, p, [entry(3, 12, [10, 10, 10])], profile, NOW);
    expect(one).toMatchObject({ kind: 'repeat', weight: 12 });
    const two = suggestNext(curl, p, [entry(3, 12, [10, 10, 10]), entry(6, 12, [10, 10, 10])], profile, NOW);
    expect(two).toMatchObject({ kind: 'increase', weight: 14 });
  });
  it('step ≤ 10 % uses normal rule', () => {
    expect(suggestNext(curl, rx(), [entry(3, 20, [12, 12, 12])], profile, NOW).kind).toBe('increase');
  });
});

describe('linear', () => {
  it('three missed sessions in a row → deload 10 %', () => {
    const h = [0, 1, 2].map((i) => entry(2 + i * 3, 100, [5, 5, 4, 3, 3], { prescription: fiveByFive }));
    const s = suggestNext(squat, fiveByFive, h, profile, NOW);
    expect(s).toMatchObject({ kind: 'deload', weight: 90 });
    expect(s.reason).toBe('↓ Deload till 90 kg – tre pass i rad med missade set');
  });
});

describe('returning, first time, rule none', () => {
  it('> 14 days since last time → ~10 % lower, rounded', () => {
    const s = suggestNext(bench, rx(), [entry(20, 80, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'returning', weight: 72.5, reps: 8, readyToIncrease: false });
    expect(s.reason).toBe('↓ Uppehåll i 20 dagar – börja om på 72,5 kg');
  });
  it('exactly 14 days is not a break', () => {
    expect(suggestNext(bench, rx(), [entry(14, 80, [12, 12, 12])], profile, NOW).kind).toBe('increase');
  });
  it('no history → first_time, weight null', () => {
    const s = suggestNext(bench, rx(), [], profile, NOW);
    expect(s).toMatchObject({ kind: 'first_time', weight: null, reps: 8, sets: 3 });
    expect(s.reason).toBe('Första gången – välj startvikt');
  });
  it('history without working sets counts as first time', () => {
    const s = suggestNext(bench, rx(), [entry(3, 40, [10], { type: 'warmup' })], profile, NOW);
    expect(s.kind).toBe('first_time');
  });
  it("rule 'none' → same as last time", () => {
    const s = suggestNext(bench, rx({ rule: 'none' }), [entry(3, 80, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'none', weight: 80, reps: 12, readyToIncrease: false });
  });
});

describe('bodyweight exercises', () => {
  const chins = exercise({ id: 'chins', name: 'Chins', equipment: 'bodyweight', measure: 'bodyweight_reps', primaryMuscle: 'lats', bodyweightMode: 'added' });
  it('progress reps first', () => {
    expect(suggestNext(chins, rx(), [entry(3, 0, [10, 9, 8])], profile, NOW)).toMatchObject({ kind: 'more_reps', weight: 0, reps: 9 });
  });
  it('at top → add extra weight (one step)', () => {
    const s = suggestNext(chins, rx(), [entry(3, 0, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'add_weight', weight: 2.5, reps: 8, readyToIncrease: true });
    expect(s.reason).toContain('extravikt');
  });
  it("mode 'none' also suggests extra weight; first time weight 0", () => {
    const dips = { ...chins, bodyweightMode: 'none' as const };
    expect(suggestNext(dips, rx(), [entry(3, 0, [12, 12, 12])], profile, NOW).kind).toBe('add_weight');
    expect(suggestNext(dips, rx(), [], profile, NOW)).toMatchObject({ kind: 'first_time', weight: 0 });
  });
  it('assisted: at top → less assistance', () => {
    const assisted = { ...chins, bodyweightMode: 'assisted' as const };
    const s = suggestNext(assisted, rx(), [entry(3, 20, [12, 12, 12])], profile, NOW);
    expect(s).toMatchObject({ kind: 'add_weight', weight: 17.5, reps: 8, readyToIncrease: true });
    expect(s.reason).toContain('Minska assistansen till 17,5 kg');
  });
  it('assisted deload → more assistance', () => {
    const assisted = { ...chins, bodyweightMode: 'assisted' as const };
    const h = [entry(2, 20, [7, 6, 6]), entry(5, 20, [7, 6, 6]), entry(8, 20, [7, 6, 6])];
    expect(suggestNext(assisted, rx(), h, profile, NOW)).toMatchObject({ kind: 'deload', weight: 22.5 });
  });
  it('pure bodyweight never deloads below zero – repeats instead', () => {
    const h = [entry(2, 0, [7, 6, 6]), entry(5, 0, [7, 6, 6]), entry(8, 0, [7, 6, 6])];
    expect(suggestNext(chins, rx(), h, profile, NOW)).toMatchObject({ kind: 'repeat', weight: 0 });
  });
});

describe('time exercises', () => {
  const plank = exercise({ id: 'plank', name: 'Planka', equipment: 'bodyweight', measure: 'time', primaryMuscle: 'abs' });
  const p = rx({ repMin: 30, repMax: 60 });
  it('all sets at target → +5 s', () => {
    const s = suggestNext(plank, p, [entry(3, 0, [0, 0, 0], { durationSec: [40, 45, 40] })], profile, NOW);
    expect(s).toMatchObject({ kind: 'more_reps', weight: null, reps: 45 });
  });
  it('reps field used as seconds when durationSec missing; below target → repeat', () => {
    const s = suggestNext(plank, p, [entry(3, 0, [30, 25, 20])], profile, NOW);
    expect(s).toMatchObject({ kind: 'repeat', reps: 30, weight: null });
  });
  it('first time', () => {
    expect(suggestNext(plank, p, [], profile, NOW)).toMatchObject({ kind: 'first_time', weight: null, reps: 30 });
  });
});

describe('plateau', () => {
  it('needs ≥ 4 weeks of data', () => {
    expect(isPlateau([entry(3, 80, [10]), entry(20, 80, [10])], NOW)).toBe(false);
  });
  it('no 1RM increase in last 4 weeks → plateau', () => {
    const h = [entry(2, 80, [10]), entry(10, 80, [10]), entry(20, 80, [9]), entry(35, 80, [10])];
    expect(isPlateau(h, NOW)).toBe(true);
  });
  it('1RM increased → no plateau', () => {
    const h = [entry(2, 82.5, [10]), entry(10, 80, [10]), entry(35, 80, [10])];
    expect(isPlateau(h, NOW)).toBe(false);
  });
  it('nothing in the last 4 weeks → not a plateau', () => {
    expect(isPlateau([entry(30, 80, [10]), entry(60, 80, [10])], NOW)).toBe(false);
  });
  it('flags plateau on non-increasing suggestions', () => {
    const h = [entry(2, 80, [10, 10, 9]), entry(10, 80, [10, 10, 10]), entry(35, 80, [11, 10, 10])];
    const s = suggestNext(bench, rx(), h, profile, NOW);
    expect(s).toMatchObject({ kind: 'more_reps', plateau: true });
    expect(s.reason).toContain('Platå: överväg deload eller nytt repsintervall');
  });
  it('does not flag plateau when increasing', () => {
    const h = [entry(2, 80, [12, 12, 12]), entry(10, 80, [12, 12, 12]), entry(35, 80, [12, 12, 12])];
    expect(suggestNext(bench, rx(), h, profile, NOW)).toMatchObject({ kind: 'increase', plateau: false });
  });
});

describe('rounding inside suggestions', () => {
  it('custom step smaller than plate resolution still increases', () => {
    const micro = exercise({ weightStep: 1 });
    const s = suggestNext(micro, rx(), [entry(3, 80, [12, 12, 12])], profile, NOW);
    expect(s.weight).toBe(82.5);
  });
  it('dumbbell list is respected', () => {
    const db = exercise({ equipment: 'dumbbell', primaryMuscle: 'shoulders' });
    const prof = { ...profile, dumbbells: [10, 12.5, 15, 17.5, 20, 22.5, 25] };
    expect(suggestNext(db, rx(), [entry(3, 20, [12, 12, 12])], prof, NOW).weight).toBe(22.5);
  });
});
