// Three steps to a pass: pick body parts → pick machines/exercises → name it and go.
// Used on its own ("Skapa gympass") and once per training day in "Skapa schema".
import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { Equipment, Exercise, MuscleGroup } from '@/engine';
import { useExercises } from '@/db/hooks';
import { put } from '@/db/repo';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { Button, Chip, Field, Page, Sheet, cx, inputClass } from '@/ui';
import { normalizeSearch, regionOf, type Region } from '@/features/library/filters';
import { CATEGORIES, DEFAULT_SETS, EQUIPMENT_GROUPS, categoryOf, exercisesByCategory, makeCustomExercise, passName, type EquipmentGroup } from './categories';

export interface BuiltPass {
  name: string;
  categories: Region[];
  exercises: Exercise[];
  /** Working sets per exercise id (DEFAULT_SETS when missing). */
  sets: Record<string, number>;
}

type Step = 'categories' | 'exercises' | 'review';

export function PassBuilder({
  title,
  onExit,
  finish,
  initial,
}: {
  /** Page title, e.g. "Skapa gympass" or "Måndag". */
  title: string;
  /** Back from the first step. */
  onExit: () => void;
  /** Buttons on the last step; each gets the finished pass. */
  finish: (pass: BuiltPass) => ReactNode;
  initial?: BuiltPass;
}) {
  const all = useExercises();
  const [step, setStep] = useState<Step>(initial ? 'review' : 'categories');
  const [categories, setCategories] = useState<Region[]>(initial?.categories ?? []);
  const [picked, setPicked] = useState<Exercise[]>(initial?.exercises ?? []);
  const [name, setName] = useState<string | null>(initial?.name ?? null);
  const [sets, setSets] = useState<Record<string, number>>(initial?.sets ?? {});

  const pass: BuiltPass = { name: name ?? passName(categories), categories, exercises: picked, sets };
  const back = step === 'categories' ? onExit : () => setStep(step === 'review' ? 'exercises' : 'categories');

  return (
    <Page title={title} back={back}>
      <StepDots step={step} />
      {step === 'categories' && (
        <CategoryStep
          all={all ?? []}
          selected={categories}
          onToggle={(k) => setCategories((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]))}
        />
      )}
      {step === 'exercises' && (
        <ExerciseStep
          all={all ?? []}
          categories={categories}
          picked={picked}
          onToggle={(e) => setPicked((list) => (list.some((x) => x.id === e.id) ? list.filter((x) => x.id !== e.id) : [...list, e]))}
          onCreated={(e) => setPicked((list) => [...list, e])}
        />
      )}
      {step === 'review' && (
        <ReviewStep pass={pass} onName={setName} onChange={setPicked} onSets={(id, n) => setSets((m) => ({ ...m, [id]: n }))} />
      )}

      <BottomBar>
        {step === 'categories' && (
          <Button variant="primary" size="xl" className="w-full" disabled={categories.length === 0} onClick={() => setStep('exercises')}>
            {categories.length === 0 ? 'Välj minst en' : `Fortsätt · ${passName(categories)}`}
          </Button>
        )}
        {step === 'exercises' && (
          <Button variant="primary" size="xl" className="w-full" disabled={picked.length === 0} onClick={() => setStep('review')}>
            {picked.length === 0 ? 'Välj övningar' : `Fortsätt · ${picked.length} ${picked.length === 1 ? 'övning' : 'övningar'}`}
          </Button>
        )}
        {step === 'review' && <div className="space-y-2">{finish(pass)}</div>}
      </BottomBar>
    </Page>
  );
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'categories', label: 'Muskelgrupper' },
  { key: 'exercises', label: 'Övningar' },
  { key: 'review', label: 'Ditt pass' },
];

function StepDots({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label={`Steg ${at + 1} av ${STEPS.length}: ${STEPS[at].label}`}>
      {STEPS.map((s, i) => (
        <li key={s.key} aria-hidden className={cx('h-1 flex-1 rounded-full', i <= at ? 'bg-accent' : 'bg-surface-2')} />
      ))}
    </ol>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe glass fixed inset-x-0 bottom-0 z-30 border-t border-white/8">
      <div className="mx-auto max-w-xl p-3">{children}</div>
    </div>
  );
}

// ---------- Step 1 ----------

function CategoryStep({ all, selected, onToggle }: { all: Exercise[]; selected: Region[]; onToggle: (k: Region) => void }) {
  const counts = useMemo(() => {
    const m = new Map<Region, number>();
    for (const e of all) m.set(regionOf(e.primaryMuscle), (m.get(regionOf(e.primaryMuscle)) ?? 0) + 1);
    return m;
  }, [all]);
  return (
    <section aria-labelledby="cat-h">
      <h2 id="cat-h" className="text-3xl font-black leading-tight">
        Vad vill du träna?
      </h2>
      <p className="mt-1 text-muted">Välj en eller flera muskelgrupper.</p>
      <div className="mt-6 grid grid-cols-2 gap-3" role="group" aria-label="Muskelgrupper">
        {CATEGORIES.map((c, i) => {
          const on = selected.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.key)}
              className={cx(
                'press relative flex min-h-28 flex-col justify-end rounded-[1.5rem] border p-4 text-left',
                i === CATEGORIES.length - 1 && CATEGORIES.length % 2 === 1 && 'col-span-2 min-h-20',
                on ? 'bg-fg text-bg border-fg' : 'border-border bg-surface',
              )}
            >
              {on && (
                <span aria-hidden className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-bg/15">
                  <Check size={16} strokeWidth={3} />
                </span>
              )}
              <span className="text-2xl font-extrabold">{c.label}</span>
              <span className={cx('text-sm', on ? 'text-bg/70' : 'text-muted')}>{counts.get(c.key) ?? 0} övningar</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Step 2 ----------

function ExerciseStep({
  all,
  categories,
  picked,
  onToggle,
  onCreated,
}: {
  all: Exercise[];
  categories: Region[];
  picked: Exercise[];
  onToggle: (e: Exercise) => void;
  onCreated: (e: Exercise) => void;
}) {
  const [group, setGroup] = useState<EquipmentGroup | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<Region | null>(null);
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const matches = (e: Exercise) => terms.every((t) => normalizeSearch(e.name).includes(t));
  const sections = exercisesByCategory(all.filter(matches), categories, group);

  return (
    <section aria-labelledby="ex-h">
      <h2 id="ex-h" className="text-3xl font-black leading-tight">
        Välj övningar
      </h2>
      <p className="mt-1 text-muted">Tryck på maskiner och övningar du ska köra – i den ordning du vill köra dem.</p>

      <div className="sticky top-14 z-10 -mx-4 mt-4 space-y-2 bg-bg/95 px-4 py-2 backdrop-blur">
        <input
          type="search"
          inputMode="search"
          placeholder="Sök…"
          aria-label="Sök övning"
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Utrustning">
          <Chip active={!group} onClick={() => setGroup(null)}>
            Alla
          </Chip>
          {EQUIPMENT_GROUPS.map((g) => (
            <Chip key={g.key} active={group?.key === g.key} onClick={() => setGroup(group?.key === g.key ? null : g)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      {sections.length === 0 && <p className="mt-6 text-center text-muted">Inga övningar matchar. Skapa en egen nedan.</p>}
      {sections.map(({ category, exercises }) => (
        <div key={category.key} className="mt-5">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{category.label}</h3>
          <ul className="divide-y divide-border">
            {exercises.map((e) => {
              const idx = picked.findIndex((x) => x.id === e.id);
              const on = idx >= 0;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(e)}
                    className={cx('flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2', on && 'bg-fg/5')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{e.name}</span>
                      <span className="block text-sm text-muted">
                        {EQUIPMENT_LABELS[e.equipment]} · {MUSCLE_LABELS[e.primaryMuscle]}
                        {e.isCustom ? ' · egen' : ''}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cx(
                        'tabular flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold',
                        on ? 'bg-fg text-bg border-fg' : 'border-line',
                      )}
                    >
                      {on ? idx + 1 : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-5 flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => categories.includes(c.key)).map((c) => (
          <Button key={c.key} size="sm" variant="ghost" className="border border-dashed border-border" onClick={() => setCreating(c.key)}>
            <Plus aria-hidden size={16} /> Egen övning – {c.label.toLowerCase()}
          </Button>
        ))}
      </div>

      <CustomExerciseSheet
        category={creating}
        initialName={query}
        onClose={() => setCreating(null)}
        onCreated={(e) => {
          setCreating(null);
          setQuery('');
          onCreated(e);
        }}
      />
    </section>
  );
}

const QUICK_EQUIPMENT: Equipment[] = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight'];

function CustomExerciseSheet({
  category,
  initialName,
  onClose,
  onCreated,
}: {
  category: Region | null;
  initialName: string;
  onClose: () => void;
  onCreated: (e: Exercise) => void;
}) {
  const cat = category ? categoryOf(category) : undefined;
  return (
    <Sheet open={!!cat} onClose={onClose} title={cat ? `Egen övning – ${cat.label.toLowerCase()}` : 'Egen övning'}>
      {cat && <CustomExerciseForm key={cat.key} muscles={cat.muscles} initialName={initialName} onCreated={onCreated} />}
    </Sheet>
  );
}

function CustomExerciseForm({ muscles, initialName, onCreated }: { muscles: MuscleGroup[]; initialName: string; onCreated: (e: Exercise) => void }) {
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState<MuscleGroup>(muscles[0]);
  const [equipment, setEquipment] = useState<Equipment>('machine');
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        const ex = makeCustomExercise({ name, muscle, equipment });
        await put('exercises', ex);
        onCreated(ex);
      }}
    >
      <Field label="Namn">
        <input className={inputClass} value={name} placeholder="t.ex. Bröstpress i Smith" autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
      {muscles.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm text-muted">Muskel</legend>
          <div className="flex flex-wrap gap-2">
            {muscles.map((m) => (
              <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
                {MUSCLE_LABELS[m]}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 text-sm text-muted">Utrustning</legend>
        <div className="flex flex-wrap gap-2">
          {QUICK_EQUIPMENT.map((eq) => (
            <Chip key={eq} active={equipment === eq} onClick={() => setEquipment(eq)}>
              {EQUIPMENT_LABELS[eq]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!name.trim() || saving}>
        Skapa och välj
      </Button>
    </form>
  );
}

// ---------- Step 3 ----------

function ReviewStep({
  pass,
  onName,
  onChange,
  onSets,
}: {
  pass: BuiltPass;
  onName: (n: string) => void;
  onChange: (list: Exercise[]) => void;
  onSets: (exerciseId: string, n: number) => void;
}) {
  const move = (i: number, d: -1 | 1) => {
    const list = [...pass.exercises];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    onChange(list);
  };
  return (
    <section aria-labelledby="rev-h" className="space-y-5">
      <div>
        <h2 id="rev-h" className="text-3xl font-black leading-tight">
          Ditt pass
        </h2>
        <p className="mt-1 text-muted">Välj antal set per övning. Vikter och reps fyller du i när du kör.</p>
      </div>
      <Field label="Namn">
        <input className={inputClass} value={pass.name} onChange={(e) => onName(e.target.value)} />
      </Field>
      <ol className="space-y-2">
        {pass.exercises.map((e, i) => (
          <li key={e.id} className="rounded-2xl bg-surface p-2 pl-3">
            <div className="flex items-center gap-2">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-extrabold">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="block text-sm text-muted">{EQUIPMENT_LABELS[e.equipment]}</span>
              </span>
              <button type="button" aria-label={`Flytta ${e.name} upp`} disabled={i === 0} onClick={() => move(i, -1)} className="flex size-10 items-center justify-center rounded-xl text-muted disabled:opacity-30 active:bg-surface-2">
                <ChevronUp size={20} />
              </button>
              <button
                type="button"
                aria-label={`Flytta ${e.name} ned`}
                disabled={i === pass.exercises.length - 1}
                onClick={() => move(i, 1)}
                className="flex size-10 items-center justify-center rounded-xl text-muted disabled:opacity-30 active:bg-surface-2"
              >
                <ChevronDown size={20} />
              </button>
              <button type="button" aria-label={`Ta bort ${e.name}`} onClick={() => onChange(pass.exercises.filter((x) => x.id !== e.id))} className="flex size-10 items-center justify-center rounded-xl text-muted active:bg-surface-2">
                <X size={18} />
              </button>
            </div>
            <SetCount value={pass.sets[e.id] ?? DEFAULT_SETS} name={e.name} onChange={(n) => onSets(e.id, n)} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Set  − 3 +" under each exercise on the last step. */
function SetCount({ value, name, onChange }: { value: number; name: string; onChange: (n: number) => void }) {
  const btn = 'flex size-10 items-center justify-center rounded-xl bg-surface-2 text-lg font-bold disabled:opacity-30 active:bg-border';
  return (
    <div className="mt-1 flex items-center justify-end gap-2 pr-1" role="group" aria-label={`Antal set för ${name}`}>
      <span className="mr-auto pl-10 text-sm text-muted">Set</span>
      <button type="button" className={btn} aria-label={`Färre set för ${name}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="tabular w-8 text-center text-xl font-extrabold" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} aria-label={`Fler set för ${name}`} disabled={value >= 10} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
