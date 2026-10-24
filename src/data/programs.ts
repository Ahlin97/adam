// Starter templates and programs. Ids are stable (prefix `st-`) and must NEVER change.
import type { Program, ProgressionRule, TemplateExercise, WorkoutTemplate } from '@/engine';

interface Line {
  ex: string; // builtin exercise id
  sets: number;
  reps: [number, number];
  rest: number;
  warmup?: number;
  rule?: ProgressionRule;
  superset?: string;
  rpe?: number;
  notes?: string;
}

function template(id: string, name: string, notes: string, lines: Line[]): WorkoutTemplate {
  const exercises: TemplateExercise[] = lines.map((l, i) => ({
    id: `${id}-${i + 1}`,
    exerciseId: l.ex,
    sets: l.sets,
    repMin: l.reps[0],
    repMax: l.reps[1],
    targetRpe: l.rpe ?? null,
    restSec: l.rest,
    warmupSets: l.warmup ?? 0,
    rule: l.rule ?? (l.reps[0] === l.reps[1] ? 'linear' : 'double'),
    supersetGroup: l.superset ? `${id}-${l.superset}` : null,
    notes: l.notes ?? '',
  }));
  return { id, name, notes, exercises };
}

const NO_DAYS: (string | null)[] = [null, null, null, null, null, null, null];
/** Index 0 = måndag. */
const days = (...idx: number[]) => Array.from({ length: 7 }, (_, i) => idx.includes(i));

function rotationProgram(id: string, name: string, rotation: string[], reminder: number[]): Program {
  return { id, name, mode: 'rotation', weekdays: [...NO_DAYS], rotation, reminderDays: days(...reminder) };
}

function weekdayProgram(id: string, name: string, weekdays: (string | null)[]): Program {
  return {
    id,
    name,
    mode: 'weekdays',
    weekdays,
    rotation: [],
    reminderDays: weekdays.map((t) => t !== null),
  };
}

export function starterPack(): { templates: WorkoutTemplate[]; programs: Program[] } {
  // ---------- Helkropp 3 dagar/vecka ----------
  const fbA = template('st-fullbody-a', 'Helkropp A', 'Helkropp, alterneras med Helkropp B.', [
    { ex: 'bi-squat', sets: 3, reps: [6, 8], rest: 180, warmup: 2 },
    { ex: 'bi-bench-press', sets: 3, reps: [6, 8], rest: 150, warmup: 2 },
    { ex: 'bi-barbell-row', sets: 3, reps: [8, 10], rest: 120, warmup: 1 },
    { ex: 'bi-lateral-raise', sets: 3, reps: [12, 15], rest: 60 },
    { ex: 'bi-plank', sets: 3, reps: [30, 60], rest: 60, rule: 'none', notes: 'Reps = sekunder.' },
  ]);
  const fbB = template('st-fullbody-b', 'Helkropp B', 'Helkropp, alterneras med Helkropp A.', [
    { ex: 'bi-deadlift', sets: 3, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-overhead-press', sets: 3, reps: [6, 8], rest: 150, warmup: 2 },
    { ex: 'bi-lat-pulldown', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-lunge', sets: 3, reps: [8, 12], rest: 90 },
    { ex: 'bi-db-curl', sets: 3, reps: [10, 12], rest: 60, superset: 'arms' },
    { ex: 'bi-triceps-pushdown', sets: 3, reps: [10, 12], rest: 60, superset: 'arms' },
  ]);

  // ---------- Överkropp/underkropp 4 dagar ----------
  const upA = template('st-upper-a', 'Överkropp A', 'Tyngre press och rodd.', [
    { ex: 'bi-bench-press', sets: 4, reps: [5, 8], rest: 180, warmup: 2 },
    { ex: 'bi-barbell-row', sets: 4, reps: [6, 10], rest: 150, warmup: 1 },
    { ex: 'bi-db-shoulder-press', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-lat-pulldown', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-db-curl', sets: 3, reps: [10, 12], rest: 60, superset: 'arms' },
    { ex: 'bi-triceps-pushdown', sets: 3, reps: [10, 12], rest: 60, superset: 'arms' },
  ]);
  const loA = template('st-lower-a', 'Underkropp A', 'Knäböjsfokus.', [
    { ex: 'bi-squat', sets: 4, reps: [5, 8], rest: 180, warmup: 2 },
    { ex: 'bi-romanian-deadlift', sets: 3, reps: [8, 10], rest: 150, warmup: 1 },
    { ex: 'bi-leg-press', sets: 3, reps: [10, 12], rest: 120 },
    { ex: 'bi-lying-leg-curl', sets: 3, reps: [10, 15], rest: 75 },
    { ex: 'bi-standing-calf-raise', sets: 4, reps: [10, 15], rest: 60 },
  ]);
  const upB = template('st-upper-b', 'Överkropp B', 'Axelpress och dragövningar.', [
    { ex: 'bi-overhead-press', sets: 4, reps: [5, 8], rest: 180, warmup: 2 },
    { ex: 'bi-chinup', sets: 4, reps: [6, 10], rest: 150 },
    { ex: 'bi-incline-db-press', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-seated-cable-row', sets: 3, reps: [10, 12], rest: 120 },
    { ex: 'bi-lateral-raise', sets: 3, reps: [12, 15], rest: 60, superset: 'shoulders' },
    { ex: 'bi-face-pull', sets: 3, reps: [12, 15], rest: 60, superset: 'shoulders' },
  ]);
  const loB = template('st-lower-b', 'Underkropp B', 'Marklyftsfokus.', [
    { ex: 'bi-deadlift', sets: 3, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-bulgarian-split-squat', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-hip-thrust', sets: 3, reps: [8, 12], rest: 120, warmup: 1 },
    { ex: 'bi-leg-extension', sets: 3, reps: [12, 15], rest: 75 },
    { ex: 'bi-hanging-leg-raise', sets: 3, reps: [8, 15], rest: 60 },
  ]);

  // ---------- Push/Pull/Ben ----------
  const push = template('st-push', 'Push', 'Bröst, axlar och triceps.', [
    { ex: 'bi-bench-press', sets: 4, reps: [6, 10], rest: 180, warmup: 2 },
    { ex: 'bi-overhead-press', sets: 3, reps: [6, 10], rest: 150, warmup: 1 },
    { ex: 'bi-incline-db-press', sets: 3, reps: [8, 12], rest: 120 },
    { ex: 'bi-lateral-raise', sets: 3, reps: [12, 15], rest: 60 },
    { ex: 'bi-rope-pushdown', sets: 3, reps: [10, 15], rest: 60, superset: 'tri' },
    { ex: 'bi-overhead-cable-extension', sets: 3, reps: [10, 15], rest: 60, superset: 'tri' },
  ]);
  const pull = template('st-pull', 'Pull', 'Rygg och biceps.', [
    { ex: 'bi-barbell-row', sets: 4, reps: [6, 10], rest: 150, warmup: 2 },
    { ex: 'bi-pullup', sets: 3, reps: [6, 10], rest: 150 },
    { ex: 'bi-seated-cable-row', sets: 3, reps: [10, 12], rest: 120 },
    { ex: 'bi-face-pull', sets: 3, reps: [12, 15], rest: 60 },
    { ex: 'bi-db-curl', sets: 3, reps: [10, 12], rest: 60, superset: 'bi' },
    { ex: 'bi-hammer-curl', sets: 3, reps: [10, 12], rest: 60, superset: 'bi' },
  ]);
  const legs = template('st-legs', 'Ben', 'Ben och mage.', [
    { ex: 'bi-squat', sets: 4, reps: [6, 10], rest: 180, warmup: 2 },
    { ex: 'bi-romanian-deadlift', sets: 3, reps: [8, 10], rest: 150, warmup: 1 },
    { ex: 'bi-leg-press', sets: 3, reps: [10, 12], rest: 120 },
    { ex: 'bi-lying-leg-curl', sets: 3, reps: [10, 15], rest: 75 },
    { ex: 'bi-standing-calf-raise', sets: 4, reps: [10, 15], rest: 60 },
  ]);

  // ---------- Enkel 5 × 5 ----------
  const sA = template('st-5x5-a', '5 × 5 A', 'Linjär progression: klarar du alla set höjer du nästa pass.', [
    { ex: 'bi-squat', sets: 5, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-bench-press', sets: 5, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-barbell-row', sets: 5, reps: [5, 5], rest: 180, warmup: 2 },
  ]);
  const sB = template('st-5x5-b', '5 × 5 B', 'Linjär progression: klarar du alla set höjer du nästa pass.', [
    { ex: 'bi-squat', sets: 5, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-overhead-press', sets: 5, reps: [5, 5], rest: 180, warmup: 2 },
    { ex: 'bi-deadlift', sets: 1, reps: [5, 5], rest: 180, warmup: 2 },
  ]);

  const programs: Program[] = [
    rotationProgram('st-prog-fullbody', 'Helkropp 3 dagar/vecka', [fbA.id, fbB.id], [0, 2, 4]),
    weekdayProgram('st-prog-upper-lower', 'Överkropp/underkropp 4 dagar', [upA.id, loA.id, null, upB.id, loB.id, null, null]),
    rotationProgram('st-prog-ppl', 'Push/Pull/Ben', [push.id, pull.id, legs.id], [0, 1, 3, 4, 5]),
    rotationProgram('st-prog-5x5', 'Enkel 5 × 5-styrka', [sA.id, sB.id], [0, 2, 4]),
  ];

  return { templates: [fbA, fbB, upA, loA, upB, loB, push, pull, legs, sA, sB], programs };
}
