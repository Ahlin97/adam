import { useMemo, useState } from 'react';
import type { Equipment, Exercise, MuscleGroup } from '@/engine';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { Chip, inputClass } from '@/ui';
import { Star } from 'lucide-react';

/** Lowercase and strip diacritics so "bankpress" matches "Bänkpress". */
export function normalizeSearch(s: string): string {
  return s
    .toLocaleLowerCase('sv')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Body regions in the order you would scan a gym: upper body top-down, then legs, core. */
export const REGIONS = [
  { key: 'chest', label: 'Bröst', muscles: ['chest'] },
  { key: 'back', label: 'Rygg', muscles: ['back', 'lats', 'traps', 'lower_back'] },
  { key: 'shoulders', label: 'Axlar', muscles: ['shoulders'] },
  { key: 'arms', label: 'Armar', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Ben & säte', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { key: 'core', label: 'Mage', muscles: ['abs', 'obliques'] },
  { key: 'full', label: 'Helkropp', muscles: ['full_body'] },
] as const satisfies readonly { key: string; label: string; muscles: readonly MuscleGroup[] }[];

export type Region = (typeof REGIONS)[number]['key'];

/** Equipment order inside a region: free weights first, then machines, cables, bodyweight. */
const EQUIPMENT_ORDER: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'];

export function regionOf(muscle: MuscleGroup): Region {
  return (REGIONS.find((r) => (r.muscles as readonly MuscleGroup[]).includes(muscle)) ?? REGIONS[REGIONS.length - 1]).key;
}

function sortKey(e: Exercise): [number, number, number] {
  const region = REGIONS.find((r) => r.key === regionOf(e.primaryMuscle))!;
  return [
    REGIONS.indexOf(region),
    (region.muscles as readonly MuscleGroup[]).indexOf(e.primaryMuscle),
    EQUIPMENT_ORDER.indexOf(e.equipment),
  ];
}

/** Sort by region, then muscle within the region, then equipment, then name. */
export function compareExercises(a: Exercise, b: Exercise): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return a.name.localeCompare(b.name, 'sv');
}

/** Group exercises under region headings (empty regions are left out). */
export function groupByRegion(exercises: Exercise[]): { key: Region; label: string; exercises: Exercise[] }[] {
  const sorted = [...exercises].sort(compareExercises);
  return REGIONS.map((r) => ({ key: r.key, label: r.label, exercises: sorted.filter((e) => regionOf(e.primaryMuscle) === r.key) })).filter(
    (g) => g.exercises.length > 0,
  );
}

export interface ExerciseFilterState {
  query: string;
  region: Region | null;
  equipment: Equipment | null;
  favoritesOnly: boolean;
}

export function useExerciseFilter(exercises: Exercise[] | undefined) {
  const [state, setState] = useState<ExerciseFilterState>({ query: '', region: null, equipment: null, favoritesOnly: false });
  const filtered = useMemo(() => {
    if (!exercises) return undefined;
    const terms = normalizeSearch(state.query).split(/\s+/).filter(Boolean);
    return exercises.filter((e) => {
      if (state.favoritesOnly && !e.isFavorite) return false;
      if (state.equipment && e.equipment !== state.equipment) return false;
      if (state.region && regionOf(e.primaryMuscle) !== state.region) return false;
      if (terms.length) {
        const hay = normalizeSearch(
          `${e.name} ${MUSCLE_LABELS[e.primaryMuscle] ?? ''} ${EQUIPMENT_LABELS[e.equipment] ?? ''}`,
        );
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [exercises, state]);
  return { state, setState, filtered };
}

const EQUIPMENTS = EQUIPMENT_ORDER;

export function ExerciseFilterBar({
  state,
  setState,
}: {
  state: ExerciseFilterState;
  setState: (fn: (s: ExerciseFilterState) => ExerciseFilterState) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        placeholder="Sök övning…"
        aria-label="Sök övning"
        className={inputClass}
        value={state.query}
        onChange={(e) => {
          const query = e.target.value;
          setState((s) => ({ ...s, query }));
        }}
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrera på kroppsdel">
        <Chip active={state.favoritesOnly} onClick={() => setState((s) => ({ ...s, favoritesOnly: !s.favoritesOnly }))}>
          <Star aria-hidden size={14} fill="currentColor" className="mr-1 inline-block align-[-2px]" />
          Favoriter
        </Chip>
        {REGIONS.map((r) => (
          <Chip key={r.key} active={state.region === r.key} onClick={() => setState((s) => ({ ...s, region: s.region === r.key ? null : r.key }))}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrera på utrustning">
        {EQUIPMENTS.map((eq) => (
          <Chip
            key={eq}
            active={state.equipment === eq}
            onClick={() => setState((s) => ({ ...s, equipment: s.equipment === eq ? null : eq }))}
          >
            {EQUIPMENT_LABELS[eq]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function exerciseSubtitle(e: Exercise): string {
  return `${MUSCLE_LABELS[e.primaryMuscle] ?? e.primaryMuscle} · ${EQUIPMENT_LABELS[e.equipment] ?? e.equipment}`;
}
