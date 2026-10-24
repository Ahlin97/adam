import { Link } from 'react-router-dom';
import type { Exercise } from '@/engine';
import { useExercises } from '@/db/hooks';
import { put } from '@/db/repo';
import { EmptyState, Page, cx } from '@/ui';
import { ExerciseFilterBar, exerciseSubtitle, useExerciseFilter } from './filters';

export function FavoriteToggle({ exercise }: { exercise: Exercise }) {
  return (
    <button
      type="button"
      aria-pressed={exercise.isFavorite}
      aria-label={exercise.isFavorite ? `Ta bort ${exercise.name} från favoriter` : `Lägg till ${exercise.name} i favoriter`}
      onClick={() => void put('exercises', { ...exercise, isFavorite: !exercise.isFavorite })}
      className={cx('min-h-12 min-w-12 rounded-xl text-2xl active:bg-surface-2', exercise.isFavorite ? 'text-warn' : 'text-muted')}
    >
      {exercise.isFavorite ? '★' : '☆'}
    </button>
  );
}

export default function ExercisesPage() {
  const exercises = useExercises();
  const { state, setState, filtered } = useExerciseFilter(exercises);

  return (
    <Page
      title="Övningar"
      back={true}
      actions={
        <Link to="/exercises/new" className="inline-flex min-h-12 items-center rounded-xl bg-accent px-4 font-semibold text-accent-fg">
          + Ny övning
        </Link>
      }
    >
      <ExerciseFilterBar state={state} setState={setState} />
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {filtered ? `${filtered.length} övningar` : 'Laddar…'}
      </p>
      {filtered && filtered.length === 0 && (
        <div className="mt-3">
          <EmptyState title="Inga övningar hittades">Ändra sökningen eller filtren, eller skapa en egen övning.</EmptyState>
        </div>
      )}
      <ul className="mt-2 divide-y divide-border">
        {filtered?.map((e) => (
          <li key={e.id} className="flex items-center gap-1">
            <Link to={`/exercises/${e.id}`} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-xl px-2 py-2 active:bg-surface-2">
              <span className="font-semibold">
                {e.name}
                {e.isCustom && <span className="ml-2 text-xs font-normal text-muted">(egen)</span>}
              </span>
              <span className="text-sm text-muted">{exerciseSubtitle(e)}</span>
            </Link>
            <FavoriteToggle exercise={e} />
          </li>
        ))}
      </ul>
    </Page>
  );
}
