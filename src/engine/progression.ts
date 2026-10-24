// The progression engine: suggestion for the next session of one exercise.
//
// Decisions (documented for the UI and tests):
// - Only sets with type 'working' count. History entries without working sets are ignored.
// - Reference weight of a session = the most common working-set weight (ties → the heaviest).
//   Only working sets at that reference weight are evaluated (lighter back-off sets are ignored).
// - Double progression, "more_reps": target = lowest set's reps + 1, capped at the required top
//   (repMax, or repMax + 2 under the big-step rule). E.g. 12/11/10 in 8–12 → 11.
// - Big step (step > 10 % of current weight): double → all sets need repMax + 2 before increasing;
//   linear → two successful sessions in a row at the same weight before increasing.
//   Not applied to bodyweight exercises (the real load there includes the body weight).
// - RPE gate: if any working set of the last session has RPE, the average must be ≤ 9 to increase.
// - Failures (deload): counted over consecutive newest sessions at the same reference weight,
//   using the current prescription's floor (double: repMin, linear: repMax).
// - Returning (> 14 days): ~10 % lighter (assisted: ~10 % more assistance), reps = repMin.
// - Time exercises: reps = seconds. All sets ≥ repMin seconds → kind 'more_reps' with
//   weakest set + 5 s; otherwise 'repeat' at repMin seconds. Weight is null.
// - Plateau is only flagged (plateau = true + hint) on more_reps / repeat / none suggestions.
import type { Exercise, EquipmentProfile, ExerciseHistoryEntry, Prescription, Suggestion } from './types.ts';
import { formatNumber, formatReps, formatWeight } from './format.ts';
import { clean, nextAvailableAbove, nextAvailableBelow, roundToAvailable, weightStepFor } from './rounding.ts';
import { epley1RM } from './records.ts';

const DAY_MS = 86_400_000;
const EPS = 1e-6;
export const RETURNING_DAYS = 14;
export const PLATEAU_DAYS = 28;
export const TIME_STEP_SEC = 5;
export const PLATEAU_HINT = 'Platå: överväg deload eller nytt repsintervall';

type HistSet = ExerciseHistoryEntry['sets'][number];

const workingSets = (e: ExerciseHistoryEntry): HistSet[] => e.sets.filter((s) => s.type === 'working');

/** Most common working-set weight of a session (ties → heaviest). null when there are no working sets. */
export function referenceWeight(entry: ExerciseHistoryEntry): number | null {
  const ws = workingSets(entry);
  if (ws.length === 0) return null;
  const counts = new Map<number, number>();
  for (const s of ws) {
    const k = clean(s.weight);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [w, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && w > best)) {
      best = w;
      bestN = n;
    }
  }
  return best;
}

/** Working sets at the reference weight. */
function refSets(entry: ExerciseHistoryEntry): HistSet[] {
  const ref = referenceWeight(entry);
  if (ref === null) return [];
  return workingSets(entry).filter((s) => Math.abs(s.weight - ref) < EPS);
}

const sameWeight = (a: number | null, b: number | null): boolean => a !== null && b !== null && Math.abs(a - b) < EPS;

function sortedHistory(history: ExerciseHistoryEntry[]): ExerciseHistoryEntry[] {
  return history
    .filter((e) => workingSets(e).length > 0)
    .slice()
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/** Best estimated 1RM in one session (working sets only). */
function sessionBest1RM(e: ExerciseHistoryEntry): number {
  let best = 0;
  for (const s of workingSets(e)) {
    if (s.weight > 0 && s.reps > 0) best = Math.max(best, epley1RM(s.weight, s.reps));
  }
  return best;
}

/** True if estimated 1RM has not increased during the last 4 weeks (needs ≥ 4 weeks of data). */
export function isPlateau(history: ExerciseHistoryEntry[], now: Date): boolean {
  const hist = sortedHistory(history);
  if (hist.length < 2) return false;
  const cutoff = now.getTime() - PLATEAU_DAYS * DAY_MS;
  const oldest = Date.parse(hist[hist.length - 1].date);
  if (oldest > cutoff) return false; // data does not span 4 weeks
  let recent = 0;
  let before = 0;
  let recentCount = 0;
  for (const e of hist) {
    const t = Date.parse(e.date);
    const b = sessionBest1RM(e);
    if (t > cutoff) {
      recentCount++;
      recent = Math.max(recent, b);
    } else {
      before = Math.max(before, b);
    }
  }
  if (recentCount === 0 || before <= 0) return false;
  return recent <= before + EPS;
}

function avgRpe(sets: HistSet[]): number | null {
  const r = sets.map((s) => s.rpe).filter((x): x is number => x !== null && x !== undefined);
  if (r.length === 0) return null;
  return r.reduce((a, b) => a + b, 0) / r.length;
}

const plural3 = (n: number): string => (n === 3 ? 'tre' : String(n));

/** Human label for a load, e.g. "80 kg", "kroppsvikt", "+5 kg extravikt", "15 kg assistans". */
function loadLabel(ex: Exercise, kg: number): string {
  if (ex.measure === 'bodyweight_reps') {
    if (ex.bodyweightMode === 'assisted') return kg > 0 ? `${formatWeight(kg, 'kg')} assistans` : 'utan assistans';
    return kg > 0 ? `kroppsvikt + ${formatWeight(kg, 'kg')}` : 'kroppsvikt';
  }
  return formatWeight(kg, 'kg');
}

function make(
  kind: Suggestion['kind'],
  weight: number | null,
  reps: number,
  sets: number,
  reason: string,
): Suggestion {
  return {
    kind,
    weight: weight === null ? null : clean(weight),
    reps,
    sets,
    reason,
    readyToIncrease: kind === 'increase' || kind === 'add_weight',
    plateau: false,
  };
}

function withPlateau(s: Suggestion, plateau: boolean): Suggestion {
  if (!plateau || !(s.kind === 'more_reps' || s.kind === 'repeat' || s.kind === 'none')) return s;
  return { ...s, plateau: true, reason: `${s.reason}. ${PLATEAU_HINT}` };
}

/** Main entry: suggestion for next session for one exercise. history newest first. */
export function suggestNext(
  ex: Exercise,
  prescription: Prescription,
  history: ExerciseHistoryEntry[],
  profile: EquipmentProfile,
  now: Date,
): Suggestion {
  const { sets, repMin, repMax } = prescription;
  const hist = sortedHistory(history);
  const isTime = ex.measure === 'time';
  const isBw = ex.measure === 'bodyweight_reps';
  const assisted = isBw && ex.bodyweightMode === 'assisted';

  // ---- First time ----
  if (hist.length === 0) {
    if (isTime) return make('first_time', null, repMin, sets, `Första gången – sikta på ${repMin} s per set`);
    if (isBw && !assisted) return make('first_time', 0, repMin, sets, 'Första gången – börja med kroppsvikt');
    return make('first_time', null, repMin, sets, 'Första gången – välj startvikt');
  }

  const last = hist[0];
  const lastSets = refSets(last);
  const lastWeight = referenceWeight(last) ?? 0;
  const daysSince = Math.floor((now.getTime() - Date.parse(last.date)) / DAY_MS);
  const round = (w: number): number => roundToAvailable(w, ex, profile);
  const step = weightStepFor(ex, profile);

  // ---- Time exercises (reps = seconds) ----
  if (isTime) {
    const secs = workingSets(last).map((s) => (s.durationSec != null && s.durationSec > 0 ? s.durationSec : s.reps));
    const minSec = Math.min(...secs);
    if (daysSince > RETURNING_DAYS) {
      const t = Math.max(TIME_STEP_SEC, Math.round((minSec * 0.9) / TIME_STEP_SEC) * TIME_STEP_SEC);
      return make('returning', null, t, sets, `↓ Uppehåll i ${daysSince} dagar – börja på ${t} s per set`);
    }
    if (prescription.rule === 'none') {
      return make('none', null, minSec, sets, `→ Samma som förra passet: ${minSec} s per set`);
    }
    if (minSec >= repMin) {
      const t = minSec + TIME_STEP_SEC;
      return make('more_reps', null, t, sets, `↑ Sikta på ${t} s per set – du klarade ${formatReps(secs)} s förra passet`);
    }
    return make('repeat', null, repMin, sets, `→ Sikta på ${repMin} s per set igen (${formatReps(secs)} s förra passet)`);
  }

  const reps = lastSets.map((s) => s.reps);
  const repsText = formatReps(reps);

  // ---- Returning after a break ----
  if (daysSince > RETURNING_DAYS) {
    let w = lastWeight;
    if (assisted) {
      w = lastWeight > 0 ? round(lastWeight * 1.1) : round(step);
      if (w <= lastWeight + EPS) w = nextAvailableAbove(lastWeight, ex, profile);
    } else if (lastWeight > 0) {
      w = round(lastWeight * 0.9);
    }
    const label = loadLabel(ex, w);
    return make('returning', w, repMin, sets, `↓ Uppehåll i ${daysSince} dagar – börja om på ${label}`);
  }

  // ---- Rule 'none' ----
  if (prescription.rule === 'none') {
    const r = reps.length > 0 ? Math.max(...reps) : repMax;
    return withPlateau(
      make('none', lastWeight, r, sets, `→ Samma som förra passet: ${loadLabel(ex, lastWeight)} × ${r}`),
      isPlateau(hist, now),
    );
  }

  const linear = prescription.rule === 'linear';
  const bigStep = !isBw && lastWeight > 0 && step > lastWeight * 0.1 + EPS;
  const floor = linear ? repMax : repMin;
  const requiredTop = linear ? repMax : bigStep ? repMax + 2 : repMax;
  const failed = (e: ExerciseHistoryEntry): boolean => refSets(e).some((s) => s.reps < floor);
  const succeeded = (e: ExerciseHistoryEntry): boolean => {
    const rs = refSets(e);
    return rs.length > 0 && rs.every((s) => s.reps >= requiredTop);
  };
  const consecutive = (pred: (e: ExerciseHistoryEntry) => boolean): number => {
    let n = 0;
    for (const e of hist) {
      if (!sameWeight(referenceWeight(e), lastWeight) || !pred(e)) break;
      n++;
    }
    return n;
  };

  // ---- Deload / repeat after misses ----
  if (failed(last)) {
    const misses = consecutive(failed);
    const canDeload = assisted || lastWeight > 0;
    if (misses >= 3 && canDeload) {
      let w: number;
      if (assisted) {
        w = lastWeight > 0 ? round(lastWeight * 1.1) : round(step);
        if (w <= lastWeight + EPS) w = nextAvailableAbove(lastWeight, ex, profile);
      } else {
        w = round(lastWeight * 0.9);
        if (w >= lastWeight - EPS) w = nextAvailableBelow(lastWeight, ex, profile);
      }
      const what = linear ? 'med missade set' : `under ${floor} reps`;
      return make('deload', w, repMin, sets, `↓ Deload till ${loadLabel(ex, w)} – ${plural3(misses)} pass i rad ${what}`);
    }
    const reason = linear
      ? `→ Behåll ${loadLabel(ex, lastWeight)} – du missade (${repsText}), försök igen`
      : `→ Behåll ${loadLabel(ex, lastWeight)} – klara minst ${floor} reps i alla set (${repsText})`;
    return withPlateau(make('repeat', lastWeight, linear ? repMax : repMin, sets, reason), isPlateau(hist, now));
  }

  // ---- Success: increase (subject to RPE gate & big-step rule) ----
  if (succeeded(last)) {
    const rpe = avgRpe(lastSets);
    if (rpe !== null && rpe > 9 + EPS) {
      return withPlateau(
        make(
          'repeat',
          lastWeight,
          repMax,
          sets,
          `→ Behåll ${loadLabel(ex, lastWeight)} – snitt-RPE ${formatNumber(rpe, 1)} var för högt för att höja`,
        ),
        isPlateau(hist, now),
      );
    }
    if (linear && bigStep && consecutive(succeeded) < 2) {
      return withPlateau(
        make(
          'repeat',
          lastWeight,
          repMax,
          sets,
          `→ Behåll ${loadLabel(ex, lastWeight)} – klara ${sets} × ${repMax} ett pass till innan höjning (stort viktsteg)`,
        ),
        isPlateau(hist, now),
      );
    }
    const did = `du klarade ${repsText} förra passet`;
    const nextReps = linear ? repMax : repMin;
    if (isBw) {
      if (assisted) {
        if (lastWeight <= EPS) {
          return make('add_weight', 0, repMax, sets, `↑ Du klarar ${repsText} utan assistans – prova med extravikt`);
        }
        const w = nextAvailableBelow(lastWeight, ex, profile);
        const label = w > 0 ? `Minska assistansen till ${formatWeight(w, 'kg')}` : 'Kör utan assistans';
        return make('add_weight', w, nextReps, sets, `↑ ${label} – ${did}`);
      }
      const w = nextAvailableAbove(lastWeight, ex, profile);
      return make('add_weight', w, nextReps, sets, `↑ Lägg på extravikt: ${formatWeight(w, 'kg')} – ${did}`);
    }
    let w = round(lastWeight + step);
    if (w <= lastWeight + EPS) w = nextAvailableAbove(lastWeight, ex, profile);
    return make('increase', w, nextReps, sets, `↑ Höj till ${formatWeight(w, 'kg')} – ${did}`);
  }

  // ---- Within range, not at top (double) – aim for more reps ----
  const minReps = reps.length > 0 ? Math.min(...reps) : repMin;
  const target = Math.min(requiredTop, Math.max(repMin, minReps + 1));
  const hint = bigStep && reps.every((r) => r >= repMax) ? ` – ${requiredTop} reps krävs innan höjning (stort viktsteg)` : '';
  return withPlateau(
    make(
      'more_reps',
      lastWeight,
      target,
      sets,
      `→ Behåll ${loadLabel(ex, lastWeight)} – sikta på fler reps (${repsText})${hint}`,
    ),
    isPlateau(hist, now),
  );
}
