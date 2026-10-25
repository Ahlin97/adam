// "Planera veckan": choose training days and a split on one screen, adjust single days, save and activate.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Moon } from 'lucide-react';
import type { WorkoutTemplate } from '@/engine';
import { useTemplates } from '@/db/hooks';
import { put, saveSettings } from '@/db/repo';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/labels';
import { Button, Card, Field, Page, Sheet, cx, inputClass } from '@/ui';
import { SPLITS, buildProgram, dayList, defaultName, recommendSplit, spreadOverWeek, type Split } from './weekPlan';

const CUSTOM = 'custom';

export default function PlanWeekPage() {
  const navigate = useNavigate();
  const templates = useTemplates();
  const tplMap = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  // Only offer splits whose starter templates still exist.
  const splits = useMemo(() => SPLITS.filter((s) => s.templates.every((id) => tplMap.has(id))), [tplMap]);

  const [days, setDays] = useState<number[]>([0, 2, 4]);
  const [splitKey, setSplitKey] = useState<string | null>(null);
  /** Set once a single day is edited by hand; the week is then kept exactly as shown. */
  const [custom, setCustom] = useState<(string | null)[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const recommended = recommendSplit(days.length, splits);
  const split: Split | null = splitKey === CUSTOM ? null : (splits.find((s) => s.key === splitKey) ?? recommended);
  const splitTemplates = split?.templates ?? [];
  // Hand-picked passes only count on training days; a day toggled on later shows "Välj pass".
  const week = custom ? custom.map((t, i) => (days.includes(i) ? t : null)) : spreadOverWeek(days, splitTemplates);
  const activeDays = days;
  const program = buildProgram({
    name: name ?? defaultName(split?.name ?? null, activeDays.length),
    days: activeDays,
    templates: splitTemplates,
    custom: custom ? week : null,
  });
  const alternates = program.mode === 'rotation';
  const missing = activeDays.filter((d) => !week[d]).length;

  const toggleDay = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b)));
  const pickSplit = (key: string) => {
    setCustom(key === CUSTOM ? [null, null, null, null, null, null, null] : null);
    setSplitKey(key);
  };
  const setDay = (d: number, templateId: string | null) => {
    const next = [...week];
    next[d] = templateId;
    setCustom(next);
    setDays(templateId ? [...new Set([...days, d])].sort((a, b) => a - b) : days.filter((x) => x !== d));
    setEditDay(null);
  };

  async function save() {
    setSaving(true);
    await put('programs', program);
    await saveSettings({ activeProgramId: program.id });
    navigate('/', { replace: true });
  }

  const tplName = (id: string | null) => (id ? (tplMap.get(id)?.name ?? 'Okänt pass') : null);

  return (
    <Page title="Planera veckan" back="/programs">
      {/* Room for the save button and the tab bar below the last card. */}
      <div className="space-y-4 pb-48">
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">1. Vilka dagar tränar du?</h2>
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Träningsdagar">
            {WEEKDAY_SHORT.map((d, i) => {
              const on = activeDays.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_LABELS[i]}
                  onClick={() => toggleDay(i)}
                  className={cx(
                    'press flex min-h-14 items-center justify-center rounded-2xl text-sm font-bold',
                    on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted">
            {activeDays.length} {activeDays.length === 1 ? 'dag' : 'dagar'} i veckan{activeDays.length ? ` · ${dayList(activeDays)}` : ''}
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">2. Upplägg</h2>
          <ul className="space-y-2" role="radiogroup" aria-label="Upplägg">
            {[...splits, null].map((s) => {
              const key = s?.key ?? CUSTOM;
              const on = (split?.key ?? CUSTOM) === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickSplit(key)}
                    className={cx(
                      'press flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left',
                      on ? 'border-accent bg-accent/10' : 'border-border bg-surface-2/60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-bold">
                        {s?.name ?? 'Egna pass'}
                        {s && s.key === recommended?.key && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-accent-fg">
                            Passar {days.length} dagar
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-muted">{s?.blurb ?? 'Välj själv vilket pass som körs vilken dag.'}</span>
                    </span>
                    {on && <Check aria-hidden size={20} className="shrink-0 text-accent" strokeWidth={3} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">3. Din vecka</h2>
            <p className="text-sm text-muted">Tryck på en dag för att byta pass eller lägga till en vilodag.</p>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface-2/60">
            {WEEKDAY_LABELS.map((label, i) => {
              const tid = week[i];
              const training = activeDays.includes(i);
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => setEditDay(i)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
                    aria-label={`${label}: ${tid ? tplName(tid) : training ? 'inget pass valt' : 'vila'}. Ändra`}
                  >
                    <span className={cx('w-10 shrink-0 text-sm font-bold', training ? 'text-fg' : 'text-muted')}>{WEEKDAY_SHORT[i]}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {tid ? (
                        <span className="font-semibold">{tplName(tid)}</span>
                      ) : training ? (
                        <span className="font-semibold text-warn">Välj pass</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <Moon aria-hidden size={14} /> Vila
                        </span>
                      )}
                    </span>
                    <ChevronRight aria-hidden size={18} className="text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
          {alternates && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              Passen växlar mellan veckorna ({program.rotation.map((id) => tplName(id)).join(' → ')}), så nästa vecka börjar där den här slutade.
            </p>
          )}
        </Card>

        <Card>
          <Field label="Namn på programmet">
            <input className={inputClass} value={name ?? program.name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Card>
      </div>

      {/* Sits just above the floating tab bar. */}
      <div className="fixed inset-x-0 bottom-[5.75rem] z-30 mb-[env(safe-area-inset-bottom)] px-3">
        <div className="mx-auto max-w-lg">
          <Button variant="primary" size="xl" className="w-full" disabled={saving || activeDays.length === 0 || missing > 0} onClick={() => void save()}>
            {missing > 0 ? `Välj pass för ${missing} ${missing === 1 ? 'dag' : 'dagar'}` : 'Spara och aktivera'}
          </Button>
        </div>
      </div>

      <Sheet open={editDay !== null} onClose={() => setEditDay(null)} title={editDay !== null ? WEEKDAY_LABELS[editDay] : 'Dag'}>
        {editDay !== null && (
          <DayPicker
            current={week[editDay]}
            templates={templates ?? []}
            suggested={splitTemplates}
            onPick={(id) => setDay(editDay, id)}
          />
        )}
      </Sheet>
    </Page>
  );
}

function DayPicker({
  current,
  templates,
  suggested,
  onPick,
}: {
  current: string | null;
  templates: WorkoutTemplate[];
  suggested: string[];
  onPick: (templateId: string | null) => void;
}) {
  // The split's own passes first, then everything else.
  const ordered = [...templates].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  const row = (on: boolean) =>
    cx('press flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left', on ? 'bg-accent/10 ring-1 ring-accent' : 'bg-surface-2 active:bg-border');
  return (
    <div className="space-y-2">
      <button type="button" className={row(current === null)} onClick={() => onPick(null)}>
        <Moon aria-hidden size={18} className="text-muted" />
        <span className="flex-1 font-semibold">Vila</span>
      </button>
      {ordered.map((t) => (
        <button key={t.id} type="button" className={row(current === t.id)} onClick={() => onPick(t.id)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{t.name || 'Namnlöst pass'}</span>
            <span className="block text-sm text-muted">
              {t.exercises.length} {t.exercises.length === 1 ? 'övning' : 'övningar'}
            </span>
          </span>
          {current === t.id && <Check aria-hidden size={18} className="text-accent" strokeWidth={3} />}
        </button>
      ))}
      <Link to="/templates/new" className="press flex min-h-12 items-center justify-center rounded-2xl border border-dashed border-border font-semibold">
        + Skapa ett nytt pass
      </Link>
    </div>
  );
}
