// Building blocks for "Skapa gympass" and "Skapa schema": body-part categories, equipment groups,
// pass naming and quick custom exercises.
import type { Equipment, Exercise, MuscleGroup, Settings, WorkoutTemplate } from '@/engine';
import { newId } from '@/db/repo';
import { compareExercises, regionOf, type Region } from '@/features/library/filters';
import { newTemplateExercise } from '@/features/templates/TemplateEditPage';

export interface Category {
  key: Region;
  label: string;
  /** Muscles counted to the category, most common first (used when creating an exercise). */
  muscles: MuscleGroup[];
}

/** In the order shown to the user. */
export const CATEGORIES: Category[] = [
  { key: 'arms', label: 'Armar', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Ben', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { key: 'back', label: 'Rygg', muscles: ['back', 'lats', 'traps', 'lower_back'] },
  { key: 'chest', label: 'Bröst', muscles: ['chest'] },
  { key: 'shoulders', label: 'Axlar', muscles: ['shoulders'] },
];

export const categoryOf = (key: Region) => CATEGORIES.find((c) => c.key === key);

export interface EquipmentGroup {
  key: string;
  label: string;
  equipment: Equipment[];
}

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  { key: 'machine', label: 'Maskiner', equipment: ['machine'] },
  { key: 'free', label: 'Fria vikter', equipment: ['barbell', 'dumbbell', 'kettlebell'] },
  { key: 'cable', label: 'Kabel', equipment: ['cable'] },
  { key: 'body', label: 'Kroppsvikt', equipment: ['bodyweight', 'other'] },
];

/** "Bröst", "Bröst & Armar", "Bröst, Rygg & Armar" – categories in display order. */
export function passName(keys: Region[]): string {
  const labels = CATEGORIES.filter((c) => keys.includes(c.key)).map((c) => c.label);
  if (labels.length <= 1) return labels[0] ?? 'Mitt pass';
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
}

/** Exercises per chosen category (an exercise belongs to the category of its primary muscle). */
export function exercisesByCategory(exercises: Exercise[], keys: Region[], group: EquipmentGroup | null): { category: Category; exercises: Exercise[] }[] {
  return CATEGORIES.filter((c) => keys.includes(c.key))
    .map((category) => ({
      category,
      exercises: exercises
        .filter((e) => regionOf(e.primaryMuscle) === category.key && (!group || group.equipment.includes(e.equipment)))
        .sort(compareExercises),
    }))
    .filter((g) => g.exercises.length > 0);
}

/** A new custom exercise from the quick form. */
export function makeCustomExercise(input: { name: string; muscle: MuscleGroup; equipment: Equipment }): Exercise {
  const bodyweight = input.equipment === 'bodyweight';
  return {
    id: newId(),
    name: input.name.trim(),
    primaryMuscle: input.muscle,
    secondaryMuscles: [],
    equipment: input.equipment,
    category: input.equipment === 'barbell' ? 'compound' : 'isolation',
    measure: bodyweight ? 'bodyweight_reps' : 'weight_reps',
    unilateral: input.equipment === 'dumbbell',
    bodyweightMode: 'none',
    weightStep: null,
    notes: '',
    isCustom: true,
    isFavorite: false,
  };
}

/**
 * The chosen exercises as a saved pass: 3 working sets each, rep range by exercise type and no
 * automatic warm-up sets (a self-built pass logs exactly the sets you planned; warm-ups can be
 * added per exercise in the pass editor).
 */
export function makeTemplate(name: string, exercises: Exercise[], settings: Settings): WorkoutTemplate {
  return {
    id: newId(),
    name: name.trim() || 'Mitt pass',
    notes: '',
    exercises: exercises.map((e) => ({ ...newTemplateExercise(e, settings), warmupSets: 0 })),
  };
}
