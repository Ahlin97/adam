// "Skapa schema": pick training days, give each day a pass (build a new one, reuse a saved one or
// the same as another day), save and activate.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Copy, Plus } from 'lucide-react';
import type { Program, WorkoutTemplate } from '@/engine';
import { useSettings, useTemplates } from '@/db/hooks';
import { newId, put, saveSettings } from '@/db/repo';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/labels';
import { Button, Field, Page, Sheet, cx, inputClass } from '@/ui';
import { PassBuilder, type BuiltPass } from './PassBuilder';
import { makeTemplate } from './categories';

/** What a day runs: a pass built here (shared by days that copy it) or an existing saved pass. */
export type DayPlan = { kind: 'new'; key: string; pass: BuiltPass } | { kind: 'saved'; templateId: string };

/** Templates to create and the weekday → template id mapping for the program. */
export function buildSchema(days: number[], plans: Record<number, DayPlan>, makeId: () => string, toTemplate: (p: BuiltPass) => WorkoutTemplate) {
  const created = new Map<string, WorkoutTemplate>();
  const weekdays: (string | null)[] = [null, null, null, null, null, null, null];
  for (const d of [...days].sort((a, b) => a - b)) {
    const plan = plans[d];
    if (!plan) continue;
    if (plan.kind === 'saved') weekdays[d] = plan.templateId;
    else {
      if (!created.has(plan.key)) created.set(plan.key, { ...toTemplate(plan.pass), id: makeId() });
      weekdays[d] = created.get(plan.key)!.id;
    }
  }
  return { templates: [...created.values()], weekdays };
}

export default function CreateSchemaPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const templates = useTemplates();
  const [step, setStep] = useState<'days' | 'week'>('days');
  const [days, setDays] = useState<number[]>([0, 2, 4]);
  const [plans, setPlans] = useState<Record<number, DayPlan>>({});
  const [name, setName] = useState('Mitt schema');
  const [choosing, setChoosing] = useState<number | null>(null);
  const [building, setBuilding] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const missing = days.filter((d) => !plans[d]).length;
  const passTitle = (p: DayPlan) => (p.kind === 'new' ? p.pass.name : (templates?.find((t) => t.id === p.templateId)?.name ?? 'Okänt pass'));
  const passCount = (p: DayPlan) =>
    p.kind === 'new' ? p.pass.exercises.length : (templates?.find((t) => t.id === p.templateId)?.exercises.length ?? 0);

  async function save() {
    setSaving(true);
    const { templates: created, weekdays } = buildSchema(days, plans, newId, (p) => makeTemplate(p.name, p.exercises, settings, p.sets));
    for (const t of created) await put('templates', t);
    const program: Program = {
      id: newId(),
      name: name.trim() || 'Mitt schema',
      mode: 'weekdays',
      weekdays,
      rotation: [],
      reminderDays: [0, 1, 2, 3, 4, 5, 6].map((d) => days.includes(d)),
    };
    await put('programs', program);
    await saveSettings({ activeProgramId: program.id });
    navigate('/', { replace: true });
  }

  // Building one day's pass takes over the screen.
  if (building !== null) {
    const current = plans[building];
    return (
      <PassBuilder
        key={building}
        title={WEEKDAY_LABELS[building]}
        initial={current?.kind === 'new' ? current.pass : undefined}
        onExit={() => setBuilding(null)}
        finish={(pass) => (
          <Button
            variant="primary"
            size="xl"
            className="w-full"
            disabled={!pass.exercises.length}
            onClick={() => {
              setPlans((p) => ({ ...p, [building]: { kind: 'new', key: current?.kind === 'new' ? current.key : newId(), pass } }));
              setBuilding(null);
            }}
          >
            <Check aria-hidden size={22} /> Klar – {WEEKDAY_LABELS[building].toLowerCase()}
          </Button>
        )}
      />
    );
  }

  if (step === 'days') {
    return (
      <Page title="Skapa schema" back={true}>
        <h2 className="text-3xl font-black leading-tight">Vilka dagar tränar du?</h2>
        <p className="mt-1 text-muted">Du ger varje dag ett pass i nästa steg.</p>
        <div className="mt-6 grid grid-cols-1 gap-2" role="group" aria-label="Träningsdagar">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = days.includes(i);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => setDays((list) => (on ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b)))}
                className={cx(
                  'press flex min-h-14 items-center justify-between rounded-2xl border px-4 text-lg font-bold',
                  on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface',
                )}
              >
                {label}
                {on && <Check aria-hidden size={20} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <Bottom>
          <Button variant="primary" size="xl" className="w-full" disabled={!days.length} onClick={() => setStep('week')}>
            {days.length ? `Fortsätt · ${days.length} ${days.length === 1 ? 'dag' : 'dagar'}` : 'Välj minst en dag'}
          </Button>
        </Bottom>
      </Page>
    );
  }

  return (
    <Page title="Skapa schema" back={() => setStep('days')}>
      <h2 className="text-3xl font-black leading-tight">Din vecka</h2>
      <p className="mt-1 text-muted">Tryck på en dag och bygg passet.</p>
      <ul className="mt-6 space-y-2">
        {days.map((d) => {
          const plan = plans[d];
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => setChoosing(d)}
                className={cx(
                  'press flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left',
                  plan ? 'border-border bg-surface' : 'border-dashed border-accent/60 bg-accent/5',
                )}
              >
                <span className="w-10 shrink-0 text-sm font-bold text-muted">{WEEKDAY_SHORT[d]}</span>
                <span className="min-w-0 flex-1">
                  {plan ? (
                    <>
                      <span className="block truncate text-lg font-bold">{passTitle(plan)}</span>
                      <span className="block text-sm text-muted">{passCount(plan)} övningar</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 font-bold text-accent">
                      <Plus aria-hidden size={18} /> Välj pass
                    </span>
                  )}
                </span>
                <ChevronRight aria-hidden size={20} className="text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6">
        <Field label="Namn på schemat">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <Bottom>
        <Button variant="primary" size="xl" className="w-full" disabled={saving || missing > 0} onClick={() => void save()}>
          {missing > 0 ? `${missing} ${missing === 1 ? 'dag' : 'dagar'} kvar att fylla` : 'Spara schema'}
        </Button>
      </Bottom>

      <Sheet open={choosing !== null} onClose={() => setChoosing(null)} title={choosing !== null ? WEEKDAY_LABELS[choosing] : 'Dag'}>
        {choosing !== null && (
          <DayOptions
            day={choosing}
            plans={plans}
            templates={templates ?? []}
            onBuild={() => {
              setBuilding(choosing);
              setChoosing(null);
            }}
            onPick={(plan) => {
              setPlans((p) => ({ ...p, [choosing]: plan }));
              setChoosing(null);
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

function DayOptions({
  day,
  plans,
  templates,
  onBuild,
  onPick,
}: {
  day: number;
  plans: Record<number, DayPlan>;
  templates: WorkoutTemplate[];
  onBuild: () => void;
  onPick: (plan: DayPlan) => void;
}) {
  const current = plans[day];
  // Passes built for other days in this schema, once each.
  const others = Object.entries(plans).filter(
    (e): e is [string, Extract<DayPlan, { kind: 'new' }>] => Number(e[0]) !== day && e[1].kind === 'new',
  );
  const uniqueOthers = others.filter(([, p], i) => others.findIndex(([, q]) => q.key === p.key) === i);
  const row = 'press flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2 text-left active:bg-border';
  return (
    <div className="space-y-4">
      <Button variant="primary" size="lg" className="w-full" onClick={onBuild}>
        <Plus aria-hidden size={20} /> {current?.kind === 'new' ? 'Ändra passet' : 'Bygg nytt pass'}
      </Button>
      {uniqueOthers.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Samma som</h3>
          {uniqueOthers.map(([d, p]) => (
            <button key={p.key} type="button" className={row} onClick={() => onPick(p)}>
              <Copy aria-hidden size={18} className="text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.pass.name}</span>
                <span className="block text-sm text-muted">{WEEKDAY_LABELS[Number(d)]}</span>
              </span>
            </button>
          ))}
        </section>
      )}
      {templates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Dina sparade pass</h3>
          {templates.map((t) => (
            <button key={t.id} type="button" className={row} onClick={() => onPick({ kind: 'saved', templateId: t.id })}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.name || 'Namnlöst pass'}</span>
                <span className="block text-sm text-muted">{t.exercises.length} övningar</span>
              </span>
              {current?.kind === 'saved' && current.templateId === t.id && <Check aria-hidden size={18} className="text-accent" />}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Bottom({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-safe glass fixed inset-x-0 bottom-0 z-30 border-t border-white/8">
      <div className="mx-auto max-w-xl p-3">{children}</div>
    </div>
  );
}
