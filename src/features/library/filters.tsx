import { useMemo, useState } from 'react';
import type { Equipment, Exercise, MuscleGroup } from '@/engine';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { Chip, inputClass } from '@/ui';

/** Lowercase and strip diacritics so "bankpress" matches "Bänkpress". */
export function normalizeSearch(s: string): string {
  return s
    .toLocaleLowerCase('sv')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export interface ExerciseFilterState {
  query: string;
  muscle: MuscleGroup | null;
  equipment: Equipment | null;
  favoritesOnly: boolean;
}

export function useExerciseFilter(exercises: Exercise[] | undefined) {
  const [state, setState] = useState<ExerciseFilterState>({ query: '', muscle: null, equipment: null, favoritesOnly: false });
  const filtered = useMemo(() => {
    if (!exercises) return undefined;
    const terms = normalizeSearch(state.query).split(/\s+/).filter(Boolean);
    return exercises.filter((e) => {
      if (state.favoritesOnly && !e.isFavorite) return false;
      if (state.equipment && e.equipment !== state.equipment) return false;
      if (state.muscle && e.primaryMuscle !== state.muscle && !e.secondaryMuscles.includes(state.muscle)) return false;
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

const MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
const EQUIPMENTS = Object.keys(EQUIPMENT_LABELS) as Equipment[];

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
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrera på utrustning">
        <Chip active={state.favoritesOnly} onClick={() => setState((s) => ({ ...s, favoritesOnly: !s.favoritesOnly }))}>
          ★ Favoriter
        </Chip>
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
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrera på muskelgrupp">
        {MUSCLES.map((m) => (
          <Chip key={m} active={state.muscle === m} onClick={() => setState((s) => ({ ...s, muscle: s.muscle === m ? null : m }))}>
            {MUSCLE_LABELS[m]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function exerciseSubtitle(e: Exercise): string {
  return `${MUSCLE_LABELS[e.primaryMuscle] ?? e.primaryMuscle} · ${EQUIPMENT_LABELS[e.equipment] ?? e.equipment}`;
}
