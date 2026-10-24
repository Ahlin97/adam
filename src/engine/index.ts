// Public API of the progression engine. Pure functions only.
// Used by the UI and by supabase/functions/_shared/engine (a copy made by `npm run engine:sync`).
// Relative imports must keep explicit `.ts` extensions (Deno).

export * from './types.ts';
export { KG_PER_LB, formatNumber, formatReps, formatWeight, kgToUnit, unitToKg } from './format.ts';
export {
  defaultStepFor,
  isLowerBody,
  nextAvailableAbove,
  nextAvailableBelow,
  platesPerSide,
  roundToAvailable,
  weightStepFor,
} from './rounding.ts';
export type { PlateResult } from './rounding.ts';
export { epley1RM, newRecords, personalRecords, weightKey } from './records.ts';
export type { PersonalRecords } from './records.ts';
export {
  PLATEAU_DAYS,
  PLATEAU_HINT,
  RETURNING_DAYS,
  TIME_STEP_SEC,
  isPlateau,
  referenceWeight,
  suggestNext,
} from './progression.ts';
export {
  WARMUP_SEC_PER_SET,
  WORK_SEC_PER_SET,
  estimateMinutes,
  scheduledTemplateId,
  upcomingSchedule,
  weekdayIndex,
} from './schedule.ts';
export { EMPTY_SESSION_NAME, WARMUP_FACTOR, WARMUP_REPS, buildSession, nextSetInSession, summarizeSession } from './session.ts';
export type { SessionSummary } from './session.ts';
