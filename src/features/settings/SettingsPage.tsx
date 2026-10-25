import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { saveSettings } from '@/db/repo';
import type { DefaultSteps, ProgressionRule, Unit } from '@/engine';
import { RULE_LABELS } from '@/lib/labels';
import { formatDuration, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/sync/auth';
import { pendingCount, syncNow, useSyncStatus } from '@/sync/sync';
import { Button, Card, Chip, Field, ListLink, Page, Sheet, Stepper, cx, inputClass } from '@/ui';
import { fmtWeight, fromUnit, parseNum, toUnit } from '@/features/stats/units';
import { commitImport, downloadFile, exportCsv, exportJson, planImportFromText, summarizePlan, type ImportPlan } from './dataTransfer';
import { buildReminderIcs } from './ics';

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const STEP_LABELS: Record<keyof DefaultSteps, string> = {
  barbellLower: 'Skivstång, underkropp',
  barbellUpper: 'Skivstång, överkropp',
  dumbbell: 'Hantlar',
  machine: 'Maskin',
  cable: 'Kabel',
  kettlebell: 'Kettlebell',
  bodyweight: 'Kroppsvikt (extravikt/assistans)',
  other: 'Övrigt',
};

const save = (patch: Parameters<typeof saveSettings>[0]) => void saveSettings(patch);

function Section({ id, title, children, description }: { id: string; title: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <Card className="space-y-4">
        {description && <p className="text-sm text-muted">{description}</p>}
        {children}
      </Card>
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center gap-3 text-left">
      <span className="flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span aria-hidden className={cx('relative h-8 w-14 shrink-0 rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-border bg-surface-2')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all', checked ? 'left-7' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Numeric weight input: shows/accepts the value in `unit`, reports kg. Commits on blur/Enter. */
function WeightInput({
  label,
  kg,
  unit,
  onCommit,
  nullable,
  hint,
}: {
  label: string;
  kg: number | null;
  unit: Unit;
  onCommit: (kg: number | null) => void;
  nullable?: boolean;
  hint?: string;
}) {
  const display = (v: number | null) => (v == null ? '' : String(Math.round(toUnit(v, unit) * 100) / 100).replace('.', ','));
  const [text, setText] = useState(display(kg));
  const [error, setError] = useState(false);
  useEffect(() => setText(display(kg)), [kg, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    if (!text.trim() && nullable) {
      setError(false);
      if (kg != null) onCommit(null);
      return;
    }
    const n = parseNum(text);
    if (!Number.isFinite(n) || n < 0) {
      setError(true);
      return;
    }
    setError(false);
    const next = Math.round(fromUnit(n, unit) * 1000) / 1000;
    if (kg == null || !near(next, kg)) onCommit(next);
  };
  return (
    <Field label={`${label} (${unit})`} hint={error ? 'Ogiltigt värde' : hint}>
      <input
        className={cx(inputClass, error && 'border-bad')}
        inputMode="decimal"
        value={text}
        aria-invalid={error}
        placeholder={nullable ? 'Ej angiven' : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </Field>
  );
}

/** Editable list of weights (dumbbells/kettlebells), stored in kg. */
function WeightList({ label, values, unit, onChange, fill }: { label: string; values: number[]; unit: Unit; onChange: (kg: number[]) => void; fill?: ReactNode }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const sorted = [...values].sort((a, b) => a - b);
  const add = () => {
    const n = parseNum(text);
    if (!Number.isFinite(n) || n <= 0) {
      setError(true);
      return;
    }
    setError(false);
    const kg = Math.round(fromUnit(n, unit) * 1000) / 1000;
    if (!values.some((v) => near(v, kg))) onChange([...values, kg].sort((a, b) => a - b));
    setText('');
  };
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted">{label}</div>
      {sorted.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {sorted.map((v) => (
            <li key={v}>
              <button
                type="button"
                className="min-h-10 rounded-full border border-border bg-surface-2 px-3 text-sm tabular"
                aria-label={`Ta bort ${fmtWeight(v, unit)}`}
                onClick={() => onChange(values.filter((x) => !near(x, v)))}
              >
                {fmtWeight(v, unit, false)} <span aria-hidden className="text-muted">✕</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Ingen lista – vikter avrundas med standardsteget.</p>
      )}
      <div className="flex gap-2">
        <input
          className={cx(inputClass, 'flex-1', error && 'border-bad')}
          inputMode="decimal"
          placeholder={`Vikt i ${unit}`}
          aria-label={`Lägg till vikt i ${label.toLowerCase()} (${unit})`}
          aria-invalid={error}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button onClick={add}>Lägg till</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {fill}
        {values.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Rensa
          </Button>
        )}
      </div>
    </div>
  );
}

const SYNC_LABELS: Record<string, string> = {
  'local-only': 'Lokalt läge – ingen synk',
  'signed-out': 'Utloggad',
  idle: 'Synkad',
  syncing: 'Synkar…',
  offline: 'Offline – ändringar sparas lokalt',
  error: 'Synkfel',
};

function AccountSection() {
  const { session, localOnly } = useAuth();
  const sync = useSyncStatus();
  const pending = useLiveQuery(pendingCount) ?? 0;
  const [email, setEmail] = useState<string | null>(session?.user.email ?? null);
  useEffect(() => {
    setEmail(session?.user.email ?? null);
    if (!supabase || session?.user.email) return;
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => undefined);
  }, [session]);

  return (
    <Section id="s-account" title="Konto">
      {localOnly || !supabase ? (
        <p>
          <span className="font-semibold">Lokalt läge.</span> <span className="text-muted">Data sparas bara i den här webbläsaren. Exportera regelbundet som säkerhetskopia.</span>
        </p>
      ) : (
        <>
          <div>
            <div className="text-sm text-muted">Inloggad som</div>
            <div className="break-all font-semibold">{email ?? '–'}</div>
          </div>
          <div aria-live="polite">
            <div className="text-sm text-muted">Synk</div>
            <div className={cx('font-semibold', sync.state === 'error' && 'text-bad')}>{SYNC_LABELS[sync.state] ?? sync.state}</div>
            <div className="text-xs text-muted">
              {pending ? `${pending} ändringar väntar på att skickas` : 'Inga osynkade ändringar'}
              {sync.lastSyncedAt && ` · senast ${formatTime(sync.lastSyncedAt)}`}
            </div>
            {sync.error && <div className="mt-1 text-xs text-bad">{sync.error}</div>}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={sync.state === 'syncing'} onClick={() => void syncNow()}>
              Synka nu
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pending && !confirm(`${pending} ändringar är inte synkade. Logga ut ändå?`)) return;
                void supabase?.auth.signOut();
              }}
            >
              Logga ut
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<void>, okText?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ ok: true, text: okText });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const text = await file.text();
      setPlan(await planImportFromText(text, file.name));
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const formatName = plan && { json: 'Gymlogg-säkerhetskopia (JSON)', gymlogg: 'Gymlogg (CSV)', strong: 'Strong (CSV)', hevy: 'Hevy (CSV)' }[plan.format];

  return (
    <Section id="s-data" title="Data" description="Exportera alla dina pass som säkerhetskopia (JSON) eller som kalkylark (CSV, ett set per rad). Import av CSV stöder Gymlogg, Strong och Hevy.">
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => void run(exportJson)}>
          Exportera JSON
        </Button>
        <Button disabled={busy} onClick={() => void run(exportCsv)}>
          Exportera CSV
        </Button>
      </div>
      <Button className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
        Importera (JSON eller CSV)…
      </Button>
      <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
      {message && (
        <p role="status" className={cx('text-sm', message.ok ? 'text-good' : 'text-bad')}>
          {message.text}
        </p>
      )}
      <Sheet open={!!plan} onClose={() => setPlan(null)} title="Importera">
        {plan && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Format: {formatName}</p>
            <p className="text-xl font-bold">{summarizePlan(plan)}</p>
            {plan.newExerciseNames.length > 0 && (
              <div>
                <div className="text-sm text-muted">Nya egna övningar (utrustning Övrigt, muskelgrupp Helkropp – går att ändra efteråt):</div>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-sm">
                  {plan.newExerciseNames.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {plan.skipped > 0 && <p className="text-sm text-warn">{plan.skipped} rader kunde inte läsas och hoppas över.</p>}
            <p className="text-xs text-muted">Poster med samma id som befintliga skrivs över; allt annat läggs till.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setPlan(null)}>Avbryt</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  const p = plan;
                  void run(async () => {
                    await commitImport(p);
                    setPlan(null);
                  }, `Importerat: ${summarizePlan(plan)}.`);
                }}
              >
                Importera
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Section>
  );
}

function RemindersSection() {
  const settings = useSettings();
  const programs = usePrograms();
  const templates = useTemplates();
  const program = programs?.find((p) => p.id === settings.activeProgramId);
  const [msg, setMsg] = useState<string | null>(null);

  const download = () => {
    if (!program) return;
    const ics = buildReminderIcs({ program, templates: templates ?? [], time: settings.reminderTime, now: new Date() });
    if (!ics) {
      setMsg(program.mode === 'rotation' ? 'Välj träningsdagar för påminnelser i programmet först.' : 'Programmet har inga träningsdagar.');
      return;
    }
    setMsg(null);
    downloadFile(`gymlogg-paminnelser.ics`, ics, 'text/calendar;charset=utf-8');
  };

  return (
    <Section
      id="s-reminders"
      title="Påminnelser"
      description="Webbappar kan inte schemalägga notiser pålitligt. Ladda i stället ner en kalenderfil med återkommande händelser och larm på dina träningsdagar och öppna den i telefonens kalender."
    >
      <Toggle label="Påminnelser på träningsdagar" checked={settings.remindersEnabled} onChange={(v) => save({ remindersEnabled: v })} />
      <Field label="Tid">
        <input type="time" className={inputClass} value={settings.reminderTime} onChange={(e) => e.target.value && save({ reminderTime: e.target.value })} />
      </Field>
      {program ? (
        <>
          <Button className="w-full" variant={settings.remindersEnabled ? 'primary' : 'secondary'} disabled={!settings.remindersEnabled} onClick={download}>
            Ladda ner kalenderfil (.ics)
          </Button>
          <p className="text-xs text-muted">
            Aktivt program: {program.name}. Ändrar du schemat eller tiden – ladda ner filen igen och ta bort de gamla händelserna.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Välj ett aktivt program under Program för att kunna skapa påminnelser.</p>
      )}
      {msg && (
        <p role="status" className="text-sm text-warn">
          {msg}
        </p>
      )}
    </Section>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const unit = s.unit;
  const standard = unit === 'lb' ? LB_PLATES.map((p) => fromUnit(p, 'lb')) : KG_PLATES;
  const extraPlates = s.plates.filter((p) => !standard.some((x) => near(x, p)));
  const togglePlate = (p: number) => {
    const has = s.plates.some((x) => near(x, p));
    const next = has ? s.plates.filter((x) => !near(x, p)) : [...s.plates, p];
    save({ plates: next.sort((a, b) => b - a) });
  };
  const dumbbellStep = unit === 'lb' ? 5 : 2;
  const dumbbellMax = unit === 'lb' ? 100 : 50;

  return (
    <Page title="Inställningar" className="space-y-6">
      <Section id="s-units" title="Enheter">
        <div className="flex gap-2" role="radiogroup" aria-label="Viktenhet">
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => save({ unit: u })}
              className={cx('min-h-12 flex-1 rounded-xl border font-semibold', unit === u ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2')}
            >
              {u === 'kg' ? 'Kilogram (kg)' : 'Pound (lb)'}
            </button>
          ))}
        </div>
      </Section>

      <Section id="s-equipment" title="Utrustning" description="Används för skivkalkylatorn och för att avrunda föreslagna vikter till sådant du faktiskt kan ta.">
        <WeightInput label="Stångvikt" kg={s.barWeight} unit={unit} onCommit={(v) => v != null && save({ barWeight: v })} />
        <div className="space-y-2">
          <div className="text-sm text-muted">Tillgängliga skivor (par)</div>
          <div className="flex flex-wrap gap-2">
            {[...standard, ...extraPlates].map((p) => (
              <Chip key={p} active={s.plates.some((x) => near(x, p))} onClick={() => togglePlate(p)}>
                {fmtWeight(p, unit)}
              </Chip>
            ))}
          </div>
        </div>
        <WeightList
          label="Hantlar"
          values={s.dumbbells}
          unit={unit}
          onChange={(v) => save({ dumbbells: v })}
          fill={
            <Button
              size="sm"
              onClick={() => {
                const list: number[] = [];
                for (let w = dumbbellStep; w <= dumbbellMax; w += dumbbellStep) list.push(Math.round(fromUnit(w, unit) * 1000) / 1000);
                save({ dumbbells: list });
              }}
            >
              Fyll {dumbbellStep}–{dumbbellMax} {unit} i steg om {dumbbellStep}
            </Button>
          }
        />
        <WeightList label="Kettlebells" values={s.kettlebells} unit={unit} onChange={(v) => save({ kettlebells: v })} />
      </Section>

      <Section id="s-steps" title="Standardsteg" description="Hur mycket vikten höjs per steg när en övning inte har ett eget viktsteg.">
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(STEP_LABELS) as (keyof DefaultSteps)[]).map((k) => (
            <WeightInput
              key={k}
              label={STEP_LABELS[k]}
              kg={s.defaultSteps[k]}
              unit={unit}
              onCommit={(v) => v != null && v > 0 && save({ defaultSteps: { ...s.defaultSteps, [k]: v } })}
            />
          ))}
        </div>
      </Section>

      <Section id="s-training" title="Träning">
        <Stepper
          label="Standardvila"
          value={s.defaultRestSec}
          step={15}
          min={15}
          size="md"
          format={formatDuration}
          onChange={(v) => save({ defaultRestSec: v })}
        />
        <div className="space-y-2">
          <div className="text-sm text-muted">Standardregel för progression</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RULE_LABELS) as ProgressionRule[]).map((r) => (
              <Chip key={r} active={s.defaultRule === r} onClick={() => save({ defaultRule: r })}>
                {RULE_LABELS[r]}
              </Chip>
            ))}
          </div>
        </div>
        <Toggle label="Ljud när vilan är slut" checked={s.soundEnabled} onChange={(v) => save({ soundEnabled: v })} />
        <Toggle label="Vibration när vilan är slut" checked={s.vibrationEnabled} onChange={(v) => save({ vibrationEnabled: v })} hint="Stöds inte i alla webbläsare (t.ex. Safari på iPhone)." />
        <WeightInput
          label="Kroppsvikt"
          kg={s.bodyWeight}
          unit={unit}
          nullable
          hint="Valfritt. Används för volym i kroppsviktsövningar."
          onCommit={(v) => save({ bodyWeight: v })}
        />
      </Section>

      <RemindersSection />

      <section aria-labelledby="s-links" className="space-y-2">
        <h2 id="s-links" className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Bibliotek
        </h2>
        <Card className="p-1">
          <ListLink to="/exercises">Övningar</ListLink>
          <ListLink to="/programs">Program</ListLink>
        </Card>
      </section>

      <DataSection />

      <AccountSection />
    </Page>
  );
}
