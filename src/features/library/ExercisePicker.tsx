import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';
import type { Exercise } from '@/engine';
import { db } from '@/db/db';
import { useExercises } from '@/db/hooks';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { Button, EmptyState, Sheet, cx } from '@/ui';
import { ExerciseFilterBar, groupByRegion, normalizeSearch, useExerciseFilter } from './filters';

const RECENT_LIMIT = 6;

/** Most recently logged exercise ids, newest first. */
function useRecentExerciseIds(): string[] {
  return (
    useLiveQuery(async () => {
      const ids: string[] = [];
      await db.sets
        .orderBy('completedAt')
        .reverse()
        .until(() => ids.length >= RECENT_LIMIT)
        .each((s) => {
          if (!s._deleted && !ids.includes(s.exerciseId)) ids.push(s.exerciseId);
        });
      return ids;
    }) ?? []
  );
}

/** Name matches that start with the query come first when searching. */
function rankForQuery(list: Exercise[], query: string): Exercise[] {
  const q = normalizeSearch(query);
  const starts = (e: Exercise) => (normalizeSearch(e.name).startsWith(q) ? 0 : 1);
  return [...list].sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'sv'));
}

/**
 * Bottom sheet for picking an exercise. Shows recently used and favorites first, then everything
 * grouped by body region. With `onPickMany` several exercises can be ticked and added in one go.
 */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  onPickMany,
  title = 'Välj övning',
}: {
  open: boolean;
  onClose(): void;
  onPick(exercise: Exercise): void;
  /** Enables multi-select; called with the ticked exercises in the order they were ticked. */
  onPickMany?(exercises: Exercise[]): void;
  title?: string;
}) {
  const exercises = useExercises();
  const recentIds = useRecentExerciseIds();
  const { state, setState, filtered } = useExerciseFilter(exercises);
  const [selected, setSelected] = useState<Exercise[]>([]);
  const multi = !!onPickMany;

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const filtering = !!(state.query.trim() || state.region || state.equipment || state.favoritesOnly);
  const sections = useMemo(() => {
    if (!filtered || !exercises) return [];
    if (state.query.trim()) return [{ key: 'hits', label: null, exercises: rankForQuery(filtered, state.query) }];
    const out: { key: string; label: string | null; exercises: Exercise[] }[] = [];
    if (!filtering) {
      const byId = new Map(exercises.map((e) => [e.id, e]));
      const recent = recentIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
      if (recent.length) out.push({ key: 'recent', label: 'Senast använda', exercises: recent });
      const favorites = exercises.filter((e) => e.isFavorite);
      if (favorites.length) out.push({ key: 'favorites', label: '★ Favoriter', exercises: favorites });
    }
    for (const g of groupByRegion(filtered)) out.push(g);
    return out;
  }, [filtered, exercises, recentIds, state.query, filtering]);

  const pick = (e: Exercise) => {
    if (!multi) return onPick(e);
    setSelected((list) => (list.some((x) => x.id === e.id) ? list.filter((x) => x.id !== e.id) : [...list, e]));
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ExerciseFilterBar state={state} setState={setState} />
      {filtered && filtered.length === 0 && (
        <div className="mt-3">
          <EmptyState title="Inga övningar hittades" />
        </div>
      )}
      {sections.map((sec) => (
        <section key={sec.key} aria-label={sec.label ?? 'Sökträffar'} className="mt-3">
          {sec.label && (
            <h3 className="sticky top-[4.25rem] z-[1] -mx-4 bg-surface/95 px-6 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted backdrop-blur">
              {sec.label}
            </h3>
          )}
          <ul className="divide-y divide-border">
            {sec.exercises.map((e) => {
              const idx = selected.findIndex((x) => x.id === e.id);
              const on = idx >= 0;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => pick(e)}
                    aria-pressed={multi ? on : undefined}
                    className={cx('flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2', on && 'bg-fg/5')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{e.name}</span>
                      <span className="block text-sm text-muted">
                        {MUSCLE_LABELS[e.primaryMuscle] ?? e.primaryMuscle} · {EQUIPMENT_LABELS[e.equipment] ?? e.equipment}
                      </span>
                    </span>
                    {multi && (
                      <span
                        aria-hidden
                        className={cx(
                          'tabular flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold',
                          on ? 'bg-fg text-bg border-fg' : 'border-line text-transparent',
                        )}
                      >
                        {on ? idx + 1 : <Check size={16} />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {multi && selected.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-3 bg-surface/95 px-4 pt-2 pb-3 backdrop-blur">
          <Button variant="primary" size="xl" className="w-full" onClick={() => onPickMany!(selected)}>
            Lägg till {selected.length} {selected.length === 1 ? 'övning' : 'övningar'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

export default ExercisePicker;
