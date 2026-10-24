import type { Exercise } from '@/engine';
import { useExercises } from '@/db/hooks';
import { EmptyState, Sheet } from '@/ui';
import { ExerciseFilterBar, exerciseSubtitle, useExerciseFilter } from './filters';

/** Bottom sheet for picking an exercise (search + filters). Favorites are listed first. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = 'Välj övning',
}: {
  open: boolean;
  onClose(): void;
  onPick(exercise: Exercise): void;
  title?: string;
}) {
  const exercises = useExercises();
  const { state, setState, filtered } = useExerciseFilter(exercises);
  const sorted = filtered && [...filtered].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ExerciseFilterBar state={state} setState={setState} />
      {sorted && sorted.length === 0 && (
        <div className="mt-3">
          <EmptyState title="Inga övningar hittades" />
        </div>
      )}
      <ul className="mt-2 divide-y divide-border">
        {sorted?.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              className="flex min-h-14 w-full flex-col justify-center rounded-xl px-2 py-2 text-left active:bg-surface-2"
            >
              <span className="font-semibold">
                {e.isFavorite && (
                  <span className="mr-1 text-warn" aria-label="Favorit">
                    ★
                  </span>
                )}
                {e.name}
              </span>
              <span className="text-sm text-muted">{exerciseSubtitle(e)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default ExercisePicker;
