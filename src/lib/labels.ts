import type { Equipment, ExerciseCategory, MeasureType, MuscleGroup, ProgressionRule, SetType } from '@/engine';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Bröst',
  back: 'Rygg',
  lats: 'Latissimus',
  traps: 'Trapezius',
  shoulders: 'Axlar',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Underarmar',
  abs: 'Mage',
  obliques: 'Sneda magmuskler',
  lower_back: 'Ländrygg',
  quads: 'Framsida lår',
  hamstrings: 'Baksida lår',
  glutes: 'Säte',
  calves: 'Vader',
  adductors: 'Adduktorer',
  abductors: 'Abduktorer',
  full_body: 'Helkropp',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Skivstång',
  dumbbell: 'Hantlar',
  machine: 'Maskin',
  cable: 'Kabel',
  bodyweight: 'Kroppsvikt',
  kettlebell: 'Kettlebell',
  other: 'Övrigt',
};

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  compound: 'Flerled',
  isolation: 'Isolering',
};

export const MEASURE_LABELS: Record<MeasureType, string> = {
  weight_reps: 'Vikt × reps',
  bodyweight_reps: 'Kroppsvikt × reps',
  time: 'Tid',
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Uppvärmning',
  working: 'Arbetsset',
  drop: 'Dropset',
  failure: 'Till failure',
};

export const RULE_LABELS: Record<ProgressionRule, string> = {
  double: 'Dubbel progression',
  linear: 'Linjär progression',
  none: 'Ingen',
};

export const WEEKDAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
export const WEEKDAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

/** JS getDay() (0 = söndag) → our index (0 = måndag). */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;
