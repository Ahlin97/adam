import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { estimateMinutes, type Exercise, type ProgressionRule, type Settings, type TemplateExercise, type WorkoutTemplate } from '@/engine';
import { get, newId, put, remove } from '@/db/repo';
import { useExerciseMap, useSettings } from '@/db/hooks';
import { RULE_LABELS } from '@/lib/labels';
import { formatDuration } from '@/lib/format';
import { Button, Card, Chip, EmptyState, Field, Page, Stepper, cx, inputClass } from '@/ui';
import { ExercisePicker } from '@/features/library/ExercisePicker';
import { safe } from '@/features/library/safe';
import { startSession } from '@/features/workout/start';
import { normalizeSupersets, supersetLabels } from './supersets';

const REST_PRESETS = [60, 90, 120, 180, 240];
const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RULES = Object.keys(RULE_LABELS) as ProgressionRule[];
const fmtNum = (n: number) => String(n).replace('.', ',');

function blankTemplate(): WorkoutTemplate {
  return { id: newId(), name: '', notes: '', exercises: [] };
}

export function newTemplateExercise(ex: Exercise, settings: Settings): TemplateExercise {
  const time = ex.measure === 'time';
  return {
    id: newId(),
    exerciseId: ex.id,
    sets: 3,
    repMin: time ? 30 : ex.category === 'compound' ? 6 : 8,
    repMax: time ? 30 : ex.category === 'compound' ? 10 : 12,
    targetRpe: null,
    restSec: settings.defaultRestSec,
    warmupSets: ex.category === 'compound' && ex.measure === 'weight_reps' ? 1 : 0,
    rule: time ? 'linear' : settings.defaultRule,
    supersetGroup: null,
    notes: '',
  };
}

/** Deep copy with fresh ids (superset groups remapped). */
export function duplicateTemplate(t: WorkoutTemplate): WorkoutTemplate {
  const groups = new Map<string, string>();
  return {
    ...t,
    id: newId(),
    name: `${t.name || 'Pass'} (kopia)`,
    exercises: t.exercises.map((e) => {
      let g: string | null = null;
      if (e.supersetGroup) {
        if (!groups.has(e.supersetGroup)) groups.set(e.supersetGroup, newId());
        g = groups.get(e.supersetGroup)!;
      }
      return { ...e, id: newId(), supersetGroup: g };
    }),
  };
}

export function prescriptionSummary(te: TemplateExercise, ex: Exercise | undefined): string {
  const time = ex?.measure === 'time';
  const reps = te.repMin === te.repMax ? `${te.repMin}` : `${te.repMin}–${te.repMax}`;
  const parts = [`${te.sets} × ${reps}${time ? ' s' : ''}`];
  if (te.targetRpe != null) parts.push(`RPE ${fmtNum(te.targetRpe)}`);
  parts.push(`vila ${formatDuration(te.restSec)}`);
  if (te.warmupSets) parts.push(`${te.warmupSets} uppv.`);
  return parts.join(' · ');
}

function ExerciseRow({
  te,
  ex,
  label,
  index,
  count,
  inGroupWithNext,
  inGroup,
  settings,
  onChange,
  onMove,
  onRemove,
  onLinkNext,
  onUnlink,
  onReplace,
}: {
  te: TemplateExercise;
  ex: Exercise | undefined;
  label: string | null;
  index: number;
  count: number;
  inGroupWithNext: boolean;
  inGroup: boolean;
  settings: Settings;
  onChange: (patch: Partial<TemplateExercise>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onLinkNext: () => void;
  onUnlink: () => void;
  onReplace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const fixed = te.repMin === te.repMax;
  const time = ex?.measure === 'time';
  const name = ex?.name ?? 'Okänd övning';
  const unit = time ? 's' : 'reps';
  const repStep = time ? 5 : 1;

  return (
    <li className={cx('relative', inGroup && 'pl-3')}>
      {inGroup && <span aria-hidden className={cx('absolute left-0 top-2 w-1 rounded-full bg-accent', inGroupWithNext ? '-bottom-3' : 'bottom-2')} />}
      <Card className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <span
            className={cx(
              'mt-1 inline-flex min-w-9 shrink-0 justify-center rounded-lg px-1.5 py-0.5 text-sm font-bold',
              label ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted',
            )}
            aria-label={label ? `Superset ${label}` : `Övning ${index + 1}`}
          >
            {label ?? index + 1}
          </span>
          <button
            type="button"
            className="min-h-12 min-w-0 flex-1 text-left"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="block font-semibold">{name}</span>
            <span className="block text-sm text-muted">{prescriptionSummary(te, ex)}</span>
          </button>
          <span aria-hidden className="mt-3 text-muted">
            {open ? '▴' : '▾'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" aria-label={`Flytta ${name} upp`} disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button size="sm" aria-label={`Flytta ${name} ned`} disabled={index === count - 1} onClick={() => onMove(1)}>
            ↓
          </Button>
          <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Stäng' : 'Ändra'}
          </Button>
          {index < count - 1 && !inGroupWithNext && (
            <Button size="sm" onClick={onLinkNext}>
              Superset med nästa
            </Button>
          )}
          {inGroup && (
            <Button size="sm" onClick={onUnlink}>
              Lös upp superset
            </Button>
          )}
        </div>

        {open && (
          <div className="space-y-4 border-t border-border pt-3">
            <Stepper size="md" label="Set" value={te.sets} min={1} step={1} onChange={(v) => onChange({ sets: Math.max(1, v) })} />

            <label className="flex min-h-12 items-center justify-between gap-3">
              <span>{time ? 'Fast tid' : 'Fasta reps'}</span>
              <input
                type="checkbox"
                className="h-6 w-6 accent-[var(--color-accent)]"
                checked={fixed}
                onChange={(e) =>
                  e.target.checked
                    ? onChange({ repMin: te.repMax, rule: te.rule === 'none' ? 'none' : 'linear' })
                    : onChange({
                        repMax: te.repMin + (time ? 15 : 4),
                        rule: te.rule === 'linear' ? settings.defaultRule : te.rule,
                      })
                }
              />
            </label>
            {fixed ? (
              <Stepper
                size="md"
                label={time ? 'Sekunder' : 'Reps'}
                value={te.repMin}
                min={1}
                step={repStep}
                onChange={(v) => onChange({ repMin: Math.max(1, v), repMax: Math.max(1, v) })}
              />
            ) : (
              <>
                <Stepper
                  size="md"
                  label={`Minst (${unit})`}
                  value={te.repMin}
                  min={1}
                  step={repStep}
                  onChange={(v) => onChange({ repMin: Math.max(1, v), repMax: Math.max(te.repMax, v) })}
                />
                <Stepper
                  size="md"
                  label={`Högst (${unit})`}
                  value={te.repMax}
                  min={1}
                  step={repStep}
                  onChange={(v) => onChange({ repMax: Math.max(1, v), repMin: Math.min(te.repMin, Math.max(1, v)) })}
                />
              </>
            )}

            <Field label="Mål-RPE (valfritt)">
              <select
                className={inputClass}
                value={te.targetRpe ?? ''}
                onChange={(e) => onChange({ targetRpe: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Inget</option>
                {RPE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {fmtNum(r)}
                  </option>
                ))}
              </select>
            </Field>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm text-muted">Vilotid</legend>
              <div className="flex flex-wrap gap-2">
                {REST_PRESETS.map((s) => (
                  <Chip key={s} active={te.restSec === s} onClick={() => onChange({ restSec: s })}>
                    {formatDuration(s)}
                  </Chip>
                ))}
              </div>
              <Stepper size="md" label="Egen vilotid" value={te.restSec} min={0} step={15} format={formatDuration} onChange={(v) => onChange({ restSec: v })} />
            </fieldset>

            <Stepper size="md" label="Uppvärmningsset" value={te.warmupSets} min={0} step={1} onChange={(v) => onChange({ warmupSets: v })} />

            <Field label="Progressionsregel">
              <select className={inputClass} value={te.rule} onChange={(e) => onChange({ rule: e.target.value as ProgressionRule })}>
                {RULES.map((r) => (
                  <option key={r} value={r}>
                    {RULE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Anteckning">
              <textarea className={`${inputClass} min-h-20 py-2`} value={te.notes} onChange={(e) => onChange({ notes: e.target.value })} />
            </Field>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={onReplace}>
                Byt övning
              </Button>
              <Button variant="danger" className="flex-1" onClick={onRemove}>
                Ta bort
              </Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

export default function TemplateEditPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const exMap = useExerciseMap();
  const [draft, setDraft] = useState<WorkoutTemplate | null | undefined>(id === 'new' ? blankTemplate() : undefined);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'replace'; teId: string } | null>(null);
  const [saved, setSaved] = useState(true);
  const persisted = useRef(id !== 'new');
  const pending = useRef<WorkoutTemplate | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Load (skip when the draft already is this template, e.g. after replacing /new in the URL).
  useEffect(() => {
    if (id === 'new' || draftRef.current?.id === id) return;
    let cancelled = false;
    setDraft(undefined);
    persisted.current = true;
    void get('templates', id).then((t) => !cancelled && setDraft(t ?? null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const t = pending.current;
    if (!t) return;
    pending.current = null;
    await put('templates', t);
    setSaved(true);
  }, []);

  // Flush pending autosave on unmount.
  useEffect(() => () => void flush(), [flush]);

  const update = (fn: (t: WorkoutTemplate) => WorkoutTemplate) => {
    const current = pending.current ?? draftRef.current;
    if (!current) return;
    const next = fn(current);
    pending.current = next;
    draftRef.current = next;
    setDraft(next);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 400);
    if (!persisted.current) {
      persisted.current = true;
      navigate(`/templates/${next.id}`, { replace: true });
    }
  };

  if (draft === undefined) return <Page title="Pass" back="/templates">Laddar…</Page>;
  if (draft === null)
    return (
      <Page title="Pass" back="/templates">
        <EmptyState title="Passet finns inte" />
      </Page>
    );

  const exercises = draft.exercises;
  const labels = supersetLabels(exercises);
  const minutes = safe(() => estimateMinutes(draft), 0);

  const setExercises = (fn: (list: TemplateExercise[]) => TemplateExercise[]) =>
    update((t) => ({ ...t, exercises: normalizeSupersets(fn(t.exercises), newId) }));

  const patchExercise = (teId: string, patch: Partial<TemplateExercise>) =>
    setExercises((list) => list.map((e) => (e.id === teId ? { ...e, ...patch } : e)));

  const move = (i: number, dir: -1 | 1) =>
    setExercises((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const linkNext = (i: number) =>
    setExercises((list) => {
      if (i + 1 >= list.length) return list;
      const a = list[i].supersetGroup;
      const b = list[i + 1].supersetGroup;
      const g = a ?? b ?? newId();
      return list.map((e, k) => (k === i || k === i + 1 || (b && e.supersetGroup === b) ? { ...e, supersetGroup: g } : e));
    });

  const unlink = (i: number) => setExercises((list) => list.map((e, k) => (k === i ? { ...e, supersetGroup: null } : e)));

  function onPick(ex: Exercise) {
    if (!picker) return;
    if (picker.mode === 'add') setExercises((list) => [...list, newTemplateExercise(ex, settings)]);
    else setExercises((list) => list.map((e) => (e.id === picker.teId ? { ...e, exerciseId: ex.id } : e)));
    setPicker(null);
  }

  async function del() {
    if (!draft) return;
    if (!window.confirm(`Ta bort passet "${draft.name || 'Namnlöst pass'}"?`)) return;
    pending.current = null;
    window.clearTimeout(timer.current);
    if (persisted.current) await remove('templates', draft.id);
    navigate('/templates', { replace: true });
  }

  async function duplicate() {
    if (!draft) return;
    await flush();
    const copy = duplicateTemplate(draft);
    await put('templates', copy);
    navigate(`/templates/${copy.id}`);
  }

  async function start() {
    if (!draft) return;
    // startSession must run inside the click gesture (audio unlock); only await a save if needed.
    if (pending.current) await flush();
    await startSession({ templateId: draft.id, programId: null });
    navigate('/workout');
  }

  return (
    <Page
      title={draft.name || 'Nytt pass'}
      back="/templates"
      actions={
        <span className="pr-2 text-xs text-muted" aria-live="polite">
          {saved ? (persisted.current ? 'Sparat' : '') : 'Sparar…'}
        </span>
      }
    >
      <div className="space-y-4">
        <Card className="space-y-3">
          <Field label="Namn">
            <input
              className={inputClass}
              value={draft.name}
              placeholder="t.ex. Push, Ben, Helkropp A"
              onChange={(e) => {
                const name = e.target.value;
                update((t) => ({ ...t, name }));
              }}
            />
          </Field>
          <Field label="Anteckningar">
            <textarea
              className={`${inputClass} min-h-20 py-2`}
              value={draft.notes}
              onChange={(e) => {
                const notes = e.target.value;
                update((t) => ({ ...t, notes }));
              }}
            />
          </Field>
          <p className="text-sm text-muted">
            {exercises.length} övningar{minutes ? ` · ca ${minutes} min` : ''}
          </p>
        </Card>

        <section aria-labelledby="ex-heading" className="space-y-3">
          <h2 id="ex-heading" className="text-lg font-bold">
            Övningar
          </h2>
          {exercises.length === 0 && <EmptyState title="Inga övningar ännu">Lägg till övningar i den ordning du kör dem.</EmptyState>}
          <ol className="space-y-3">
            {exercises.map((te, i) => (
              <ExerciseRow
                key={te.id}
                te={te}
                ex={exMap?.get(te.exerciseId)}
                label={labels[i]}
                index={i}
                count={exercises.length}
                inGroup={!!te.supersetGroup}
                inGroupWithNext={!!te.supersetGroup && exercises[i + 1]?.supersetGroup === te.supersetGroup}
                settings={settings}
                onChange={(p) => patchExercise(te.id, p)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => setExercises((list) => list.filter((e) => e.id !== te.id))}
                onLinkNext={() => linkNext(i)}
                onUnlink={() => unlink(i)}
                onReplace={() => setPicker({ mode: 'replace', teId: te.id })}
              />
            ))}
          </ol>
          <Button variant="primary" size="lg" className="w-full" onClick={() => setPicker({ mode: 'add' })}>
            + Lägg till övning
          </Button>
        </section>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="good" className="col-span-2" size="lg" disabled={!persisted.current} onClick={() => void start()}>
            Starta pass
          </Button>
          <Button disabled={!persisted.current} onClick={() => void duplicate()}>
            Duplicera
          </Button>
          <Button variant="danger" onClick={() => void del()}>
            Ta bort
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onPick={onPick}
        onPickMany={
          picker?.mode === 'add'
            ? (list) => {
                setExercises((prev) => [...prev, ...list.map((ex) => newTemplateExercise(ex, settings))]);
                setPicker(null);
              }
            : undefined
        }
        title={picker?.mode === 'replace' ? 'Byt övning' : 'Lägg till övningar'}
      />
    </Page>
  );
}
