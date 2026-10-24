import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { upcomingSchedule, type Program } from '@/engine';
import { get, newId, put, remove, saveSettings } from '@/db/repo';
import { useCompletedSessions, useSettings, useTemplates } from '@/db/hooks';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Button, Card, Chip, EmptyState, Field, Page, inputClass } from '@/ui';
import { safe } from '@/features/library/safe';

function blankProgram(): Program {
  return {
    id: newId(),
    name: '',
    mode: 'weekdays',
    weekdays: [null, null, null, null, null, null, null],
    rotation: [],
    reminderDays: [true, false, true, false, true, false, false],
  };
}

export default function ProgramEditPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const templates = useTemplates();
  const completed = useCompletedSessions();
  const settings = useSettings();
  const [draft, setDraft] = useState<Program | null | undefined>(id === 'new' ? blankProgram() : undefined);
  const [saved, setSaved] = useState(true);
  const [addId, setAddId] = useState('');
  const persisted = useRef(id !== 'new');
  const pending = useRef<Program | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (id === 'new' || draftRef.current?.id === id) return;
    let cancelled = false;
    setDraft(undefined);
    persisted.current = true;
    void get('programs', id).then((p) => !cancelled && setDraft(p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    await put('programs', p);
    setSaved(true);
  }, []);
  useEffect(() => () => void flush(), [flush]);

  const update = (fn: (p: Program) => Program) => {
    const current = draftRef.current;
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
      navigate(`/programs/${next.id}`, { replace: true });
    }
  };

  if (draft === undefined) return <Page title="Program" back="/programs">Laddar…</Page>;
  if (draft === null)
    return (
      <Page title="Program" back="/programs">
        <EmptyState title="Programmet finns inte" />
      </Page>
    );

  const tplList = templates ?? [];
  const tplName = (tid: string) => tplList.find((t) => t.id === tid)?.name ?? 'Okänt pass';
  const isActive = settings.activeProgramId === draft.id;
  const upcoming = safe(() => upcomingSchedule(draft, completed ?? [], new Date(), 5), null);

  const moveRotation = (i: number, dir: -1 | 1) =>
    update((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.rotation.length) return p;
      const r = [...p.rotation];
      [r[i], r[j]] = [r[j], r[i]];
      return { ...p, rotation: r };
    });

  async function del() {
    if (!draft) return;
    if (!window.confirm(`Ta bort programmet "${draft.name || 'Namnlöst program'}"?`)) return;
    pending.current = null;
    window.clearTimeout(timer.current);
    if (persisted.current) await remove('programs', draft.id);
    if (isActive) await saveSettings({ activeProgramId: null });
    navigate('/programs', { replace: true });
  }

  async function activate() {
    if (!draft) return;
    if (pending.current || !persisted.current) {
      persisted.current = true;
      pending.current = draft;
      await flush();
      navigate(`/programs/${draft.id}`, { replace: true });
    }
    await saveSettings({ activeProgramId: isActive ? null : draft.id });
  }

  return (
    <Page
      title={draft.name || 'Nytt program'}
      back="/programs"
      actions={
        <span className="pr-2 text-xs text-muted" aria-live="polite">
          {saved ? (persisted.current ? 'Sparat' : '') : 'Sparar…'}
        </span>
      }
    >
      <div className="space-y-4">
        <Card className="space-y-4">
          <Field label="Namn">
            <input
              className={inputClass}
              value={draft.name}
              placeholder="t.ex. Push/Pull/Ben"
              onChange={(e) => {
                const name = e.target.value;
                update((p) => ({ ...p, name }));
              }}
            />
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm text-muted">Schema</legend>
            <div className="grid grid-cols-2 gap-2">
              <Chip active={draft.mode === 'weekdays'} onClick={() => update((p) => ({ ...p, mode: 'weekdays' }))}>
                Veckodagar
              </Chip>
              <Chip active={draft.mode === 'rotation'} onClick={() => update((p) => ({ ...p, mode: 'rotation' }))}>
                Rotation
              </Chip>
            </div>
            <p className="mt-2 text-xs text-muted">
              {draft.mode === 'weekdays'
                ? 'Varje veckodag har ett fast pass, t.ex. mån = Push, ons = Pull.'
                : 'Passen körs i tur och ordning (A → B → C) oavsett dag.'}
            </p>
          </fieldset>
          <Button variant={isActive ? 'secondary' : 'primary'} className="w-full" onClick={() => void activate()}>
            {isActive ? 'Aktivt program – avaktivera' : 'Aktivera program'}
          </Button>
        </Card>

        {tplList.length === 0 && <EmptyState title="Inga passmallar">Skapa passmallar först under Pass.</EmptyState>}

        {draft.mode === 'weekdays' ? (
          <Card className="space-y-2">
            <h2 className="text-lg font-bold">Veckodagar</h2>
            {WEEKDAY_LABELS.map((day, i) => (
              <label key={day} className="flex items-center gap-3">
                <span className="w-20 shrink-0 font-medium">{day}</span>
                <select
                  className={inputClass}
                  value={draft.weekdays[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    update((p) => {
                      const w = [...p.weekdays];
                      while (w.length < 7) w.push(null);
                      w[i] = v;
                      return { ...p, weekdays: w };
                    });
                  }}
                >
                  <option value="">Vilodag</option>
                  {tplList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || 'Namnlöst pass'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </Card>
        ) : (
          <>
            <Card className="space-y-3">
              <h2 className="text-lg font-bold">Rotation</h2>
              {draft.rotation.length === 0 && <p className="text-sm text-muted">Lägg till pass i den ordning de ska köras.</p>}
              <ol className="space-y-2">
                {draft.rotation.map((tid, i) => (
                  <li key={`${tid}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
                    <span className="w-6 text-center font-bold text-muted">{String.fromCharCode(65 + (i % 26))}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{tplName(tid)}</span>
                    <Button size="sm" aria-label={`Flytta ${tplName(tid)} upp`} disabled={i === 0} onClick={() => moveRotation(i, -1)}>
                      ↑
                    </Button>
                    <Button size="sm" aria-label={`Flytta ${tplName(tid)} ned`} disabled={i === draft.rotation.length - 1} onClick={() => moveRotation(i, 1)}>
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      aria-label={`Ta bort ${tplName(tid)} från rotationen`}
                      onClick={() => update((p) => ({ ...p, rotation: p.rotation.filter((_, k) => k !== i) }))}
                    >
                      ✕
                    </Button>
                  </li>
                ))}
              </ol>
              {tplList.length > 0 && (
                <div className="flex gap-2">
                  <select className={inputClass} aria-label="Pass att lägga till" value={addId} onChange={(e) => setAddId(e.target.value)}>
                    <option value="">Välj pass…</option>
                    {tplList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || 'Namnlöst pass'}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    disabled={!addId}
                    onClick={() => {
                      update((p) => ({ ...p, rotation: [...p.rotation, addId] }));
                      setAddId('');
                    }}
                  >
                    Lägg till
                  </Button>
                </div>
              )}
            </Card>
            <Card>
              <fieldset>
                <legend className="text-lg font-bold">Träningsdagar</legend>
                <p className="mb-2 text-xs text-muted">Används för påminnelser.</p>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_SHORT.map((d, i) => (
                    <label key={d} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 py-1 text-sm">
                      <span aria-hidden>{d}</span>
                      <input
                        type="checkbox"
                        aria-label={WEEKDAY_LABELS[i]}
                        className="h-6 w-6 accent-[var(--color-accent)]"
                        checked={!!draft.reminderDays[i]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          update((p) => {
                            const r = [...p.reminderDays];
                            while (r.length < 7) r.push(false);
                            r[i] = checked;
                            return { ...p, reminderDays: r };
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </Card>
          </>
        )}

        <Card>
          <h2 className="mb-2 text-lg font-bold">Står på tur</h2>
          {upcoming === null ? (
            <p className="text-sm text-muted">Förhandsvisningen är inte tillgänglig just nu.</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted">Inga pass schemalagda.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((u, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-muted">{formatDate(u.date)}</span>
                  <span className="font-medium">{tplName(u.templateId)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Button variant="danger" className="w-full" onClick={() => void del()}>
          Ta bort program
        </Button>
      </div>
    </Page>
  );
}
