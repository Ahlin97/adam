import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BodyweightMode, Equipment, Exercise, ExerciseCategory, MeasureType, MuscleGroup } from '@/engine';
import { get, newId, put, remove } from '@/db/repo';
import { useSettings } from '@/db/hooks';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MEASURE_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { Button, Card, Chip, EmptyState, Field, Page, inputClass } from '@/ui';
import { fmtWeight, standardStep } from './safe';

const MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
const EQUIPMENTS = Object.keys(EQUIPMENT_LABELS) as Equipment[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ExerciseCategory[];
const MEASURES = Object.keys(MEASURE_LABELS) as MeasureType[];
const BW_MODES: { value: BodyweightMode; label: string }[] = [
  { value: 'none', label: 'Ingen' },
  { value: 'added', label: 'Extravikt' },
  { value: 'assisted', label: 'Assistans' },
];

function blankExercise(): Exercise {
  return {
    id: newId(),
    name: '',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    category: 'compound',
    measure: 'weight_reps',
    unilateral: false,
    bodyweightMode: 'none',
    weightStep: null,
    notes: '',
    isCustom: true,
    isFavorite: false,
  };
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function ExerciseEditPage() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const settings = useSettings();
  const [draft, setDraft] = useState<Exercise | null | undefined>(isNew ? blankExercise() : undefined);
  const [stepText, setStepText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      setDraft(blankExercise());
      setStepText('');
      return;
    }
    let cancelled = false;
    void get('exercises', id).then((ex) => {
      if (cancelled) return;
      setDraft(ex ?? null);
      setStepText(ex?.weightStep != null ? String(ex.weightStep).replace('.', ',') : '');
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined) return <Page title="Övning" back="/exercises">Laddar…</Page>;
  if (draft === null)
    return (
      <Page title="Övning" back="/exercises">
        <EmptyState title="Övningen finns inte" />
      </Page>
    );

  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const std = standardStep(draft, settings);

  const toggleSecondary = (m: MuscleGroup) =>
    set('secondaryMuscles', draft.secondaryMuscles.includes(m) ? draft.secondaryMuscles.filter((x) => x !== m) : [...draft.secondaryMuscles, m]);

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Ange ett namn.');
      return;
    }
    let weightStep: number | null = null;
    if (stepText.trim()) {
      const n = Number(stepText.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        setError('Viktsteget måste vara ett positivt tal.');
        return;
      }
      weightStep = n;
    }
    const ex: Exercise = {
      ...draft,
      name,
      weightStep,
      secondaryMuscles: draft.secondaryMuscles.filter((m) => m !== draft.primaryMuscle),
      bodyweightMode: draft.measure === 'bodyweight_reps' ? draft.bodyweightMode : 'none',
    };
    await put('exercises', ex);
    navigate('/exercises');
  }

  async function del() {
    if (!draft || !draft.isCustom) return;
    if (!window.confirm(`Ta bort övningen "${draft.name}"? Historiken behålls.`)) return;
    await remove('exercises', draft.id);
    navigate('/exercises');
  }

  return (
    <Page
      title={isNew ? 'Ny övning' : draft.name || 'Övning'}
      back="/exercises"
      actions={
        <Button variant="primary" onClick={() => void save()}>
          Spara
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && (
          <p role="alert" className="rounded-xl bg-bad/20 p-3 text-bad">
            {error}
          </p>
        )}
        <Card className="space-y-4">
          <Field label="Namn">
            <input className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="t.ex. Bulgarian split squat" required />
          </Field>
          <Toggle label="Favorit" checked={draft.isFavorite} onChange={(v) => set('isFavorite', v)} />
        </Card>

        <Card className="space-y-4">
          <Field label="Primär muskelgrupp">
            <select className={inputClass} value={draft.primaryMuscle} onChange={(e) => set('primaryMuscle', e.target.value as MuscleGroup)}>
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm text-muted">Sekundära muskelgrupper</legend>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.filter((m) => m !== draft.primaryMuscle).map((m) => (
                <Chip key={m} active={draft.secondaryMuscles.includes(m)} onClick={() => toggleSecondary(m)}>
                  {MUSCLE_LABELS[m]}
                </Chip>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="space-y-4">
          <Segmented
            label="Utrustning"
            value={draft.equipment}
            options={EQUIPMENTS.map((v) => ({ value: v, label: EQUIPMENT_LABELS[v] }))}
            onChange={(v) => set('equipment', v)}
          />
          <Segmented
            label="Typ"
            value={draft.category}
            options={CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABELS[v] }))}
            onChange={(v) => set('category', v)}
          />
          <Segmented
            label="Mäts som"
            value={draft.measure}
            options={MEASURES.map((v) => ({ value: v, label: MEASURE_LABELS[v] }))}
            onChange={(v) => set('measure', v)}
          />
          {draft.measure === 'bodyweight_reps' && (
            <Segmented label="Kroppsviktsläge" value={draft.bodyweightMode} options={BW_MODES} onChange={(v) => set('bodyweightMode', v)} />
          )}
          {draft.measure !== 'time' && (
            <Toggle label="Vikt per hand/sida" hint="Unilateral – vikten loggas per hand eller sida." checked={draft.unilateral} onChange={(v) => set('unilateral', v)} />
          )}
        </Card>

        {draft.measure !== 'time' && (
          <Card>
            <Field label="Eget viktsteg (kg)" hint={`Tomt = standard (${fmtWeight(std, 'kg')} för ${EQUIPMENT_LABELS[draft.equipment].toLowerCase()}).`}>
              <input
                className={inputClass}
                inputMode="decimal"
                value={stepText}
                placeholder={`Standard: ${String(std).replace('.', ',')}`}
                onChange={(e) => setStepText(e.target.value)}
              />
            </Field>
          </Card>
        )}

        <Card>
          <Field label="Teknikanteckningar">
            <textarea className={`${inputClass} min-h-28 py-2`} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Fokuspunkter, inställningar på maskinen …" />
          </Field>
        </Card>

        <Button type="submit" variant="primary" size="lg" className="w-full">
          Spara
        </Button>
        {!isNew && draft.isCustom && (
          <Button variant="danger" className="w-full" onClick={() => void del()}>
            Ta bort övning
          </Button>
        )}
        {!draft.isCustom && <p className="text-center text-sm text-muted">Förinlagd övning – kan redigeras men inte tas bort.</p>}
      </form>
    </Page>
  );
}
