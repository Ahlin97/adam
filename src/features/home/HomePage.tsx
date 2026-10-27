import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateMinutes, scheduledTemplateId, suggestNext, upcomingSchedule } from '@/engine';
import type { Exercise, Program, Settings, WorkoutSession, WorkoutTemplate } from '@/engine';
import { getExerciseHistory } from '@/db/repo';
import { useActiveSession, useCompletedSessions, useExerciseMap, usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { Button, Card, EmptyState, Page, Sheet, cx } from '@/ui';
import { formatDate, formatLongDate } from '@/lib/format';
import { startSession } from '@/features/workout/start';
import { CalendarDays, Check, Clock, Dumbbell, Flame, Layers, Play, Plus, TrendingUp } from 'lucide-react';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/labels';
import { weekProgress, type WeekProgress } from './weekProgress';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function minutesFor(t: WorkoutTemplate): number | null {
  return safe<number | null>(() => estimateMinutes(t), null);
}

function summaryText(t: WorkoutTemplate): string {
  const n = t.exercises.length;
  const min = minutesFor(t);
  return `${n} ${n === 1 ? 'övning' : 'övningar'}${min ? `, ca ${min} min` : ''}`;
}

/** Set of exercise ids in the template that are "redo att höja" (+ reason per id). */
function useReadyToIncrease(
  template: WorkoutTemplate | null,
  exercises: Map<string, Exercise> | undefined,
  settings: Settings,
  historyVersion: number,
): Map<string, string> {
  const [ready, setReady] = useState<Map<string, string>>(new Map());
  // useExerciseMap returns a new Map on every render – key the effect on stable values instead.
  const exRef = useRef(exercises);
  exRef.current = exercises;
  const hasExercises = !!exercises;
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    const exercises = exRef.current;
    if (!template || !exercises) {
      setReady(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = new Map<string, string>();
      const now = new Date();
      for (const te of template.exercises) {
        const ex = exercises.get(te.exerciseId);
        if (!ex) continue;
        try {
          const history = await getExerciseHistory(ex.id);
          if (!history.length) continue;
          const s = suggestNext(ex, te, history, settings, now);
          if (s.readyToIncrease) result.set(ex.id, s.reason);
        } catch {
          // Engine not available yet – no badges.
        }
      }
      if (!cancelled) setReady(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [template, hasExercises, settingsKey, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}

export default function HomePage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const programs = usePrograms();
  const templates = useTemplates();
  const completed = useCompletedSessions();
  const active = useActiveSession();
  const exercises = useExerciseMap();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);

  const templateMap = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  const program: Program | undefined = programs?.find((p) => p.id === settings.activeProgramId);
  const today = useMemo(() => new Date(), []);

  const todayTemplateId = useMemo(
    () => (program && completed ? safe(() => scheduledTemplateId(program, completed, today), null) : null),
    [program, completed, today],
  );
  const todayTemplate = todayTemplateId ? (templateMap.get(todayTemplateId) ?? null) : null;

  const upcoming = useMemo(() => {
    if (!program || !completed) return [];
    const list = safe(() => upcomingSchedule(program, completed, today, 6), []);
    const todayKey = today.toDateString();
    // Rotation: first entry is the one shown as "Idag". Weekdays: skip today's date.
    const rest = program.mode === 'rotation' ? list.slice(1) : list.filter((u) => u.date.toDateString() !== todayKey);
    return rest.slice(0, 4);
  }, [program, completed, today]);

  const ready = useReadyToIncrease(todayTemplate, exercises, settings, completed?.length ?? 0);

  async function start(templateId: string | null, programId: string | null) {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      await startSession({ templateId, programId });
      navigate('/workout');
    } catch (e) {
      console.error(e);
      setError('Kunde inte starta passet. Försök igen.');
      setStarting(false);
    }
  }

  const loading = programs === undefined || templates === undefined || completed === undefined || active === undefined;
  const programTemplates = program
    ? [...new Set([...program.rotation, ...program.weekdays.filter((t): t is string => !!t)])]
        .map((id) => templateMap.get(id))
        .filter((t): t is WorkoutTemplate => !!t)
    : [];

  return (
    <Page title="Idag">
      <p className="mb-5 text-sm font-medium text-muted first-letter:uppercase">
        {greeting(today)} · {formatLongDate(today)}
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-bad/20 p-3 text-bad">
          {error}
        </p>
      )}

      {loading ? null : active ? (
        <ActiveCard session={active} onContinue={() => navigate('/workout')} />
      ) : !program ? (
        <>
          <StartChoices />
          {(templates?.length ?? 0) > 0 && (
            <YourPasses
              templates={templates ?? []}
              lastTemplateId={completed?.find((s) => s.templateId && templateMap.has(s.templateId))?.templateId ?? null}
              starting={starting}
              onStart={(id) => void start(id, null)}
            />
          )}
        </>
      ) : todayTemplate ? (
        <TodayCard
          template={todayTemplate}
          programName={program.name}
          exercises={exercises}
          ready={ready}
          starting={starting}
          onStart={() => void start(todayTemplate.id, program.id)}
        />
      ) : todayTemplateId ? (
        <EmptyState title="Dagens passmall saknas">
          Mallen i programmet finns inte längre. <Link className="text-accent underline" to={`/programs/${program.id}`}>Redigera programmet</Link>
        </EmptyState>
      ) : (
        <Card className="space-y-3 p-5">
          <Eyebrow>{program.name}</Eyebrow>
          <h2 className="text-3xl font-extrabold">Vilodag</h2>
          <p className="text-muted">Inget pass planerat idag. Vila och återhämta dig – eller träna ändå.</p>
          <Button size="lg" className="w-full" onClick={() => setPickOpen(true)} disabled={starting}>
            <Dumbbell aria-hidden size={20} /> Träna ändå
          </Button>
        </Card>
      )}

      {!loading && (program || (completed?.length ?? 0) > 0) && (
        <WeekStrip progress={weekProgress(program, completed ?? [], today)} today={today} />
      )}

      {!loading && program && upcoming.length > 0 && (
        <section className="mt-6" aria-labelledby="upcoming-h">
          <SectionTitle id="upcoming-h">Står på tur</SectionTitle>
          <ul className="card divide-y divide-border overflow-hidden">
            {upcoming.map((u, i) => {
              const t = templateMap.get(u.templateId);
              const [wd, ...rest] = formatDate(u.date).split(' ');
              return (
                <li key={`${u.templateId}-${i}`} className="flex min-h-16 items-center gap-4 px-4 py-3">
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-2 leading-tight">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">{wd.replace('.', '')}</span>
                    <span className="tabular text-lg font-extrabold">{rest.join(' ').replace(/\D+/g, '')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t?.name ?? 'Okänd mall'}</span>
                    {t && <span className="block text-sm text-muted">{summaryText(t)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!loading && !active && program && (
        <nav className="mt-6 grid grid-cols-2 gap-3" aria-label="Mer">
          <QuickLink to="/skapa/pass" icon={<Plus size={20} />}>
            Skapa gympass
          </QuickLink>
          <QuickLink to="/programs" icon={<CalendarDays size={20} />}>
            Ändra schema
          </QuickLink>
        </nav>
      )}

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Välj pass">
        <div className="space-y-2">
          {programTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={starting}
              onClick={() => {
                setPickOpen(false);
                void start(t.id, program?.id ?? null);
              }}
              className="press flex min-h-14 w-full flex-col items-start justify-center rounded-2xl bg-surface-2 px-4 py-2 text-left active:bg-border"
            >
              <span className="font-semibold">{t.name}</span>
              <span className="text-sm text-muted">{summaryText(t)}</span>
            </button>
          ))}
          <Link
            to="/skapa/pass"
            className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 font-semibold"
          >
            <Plus aria-hidden size={18} /> Skapa gympass
          </Link>
        </div>
      </Sheet>
    </Page>
  );
}

/** This week Mon–Sun: planned days outlined, trained days filled, plus goal and streak. */
function WeekStrip({ progress, today }: { progress: WeekProgress; today: Date }) {
  const { planned, trained, done, goal, streak } = progress;
  const todayIdx = (today.getDay() + 6) % 7;
  const reached = goal != null && done >= goal;
  return (
    <section className="card mt-6 space-y-3 p-4" aria-labelledby="week-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="week-h" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
          Den här veckan
        </h2>
        {streak > 1 && (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-accent">
            <Flame aria-hidden size={16} /> {streak} veckor i rad
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold">
        {goal != null ? (
          <>
            {done} av {goal} pass{reached && <span className="text-accent"> – mål nått!</span>}
          </>
        ) : (
          `${done} pass`
        )}
      </p>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Veckodagar">
        {WEEKDAY_SHORT.map((d, i) => {
          const label = `${WEEKDAY_LABELS[i]}: ${trained[i] ? 'tränat' : planned[i] ? (i < todayIdx ? 'missat' : 'planerat') : 'vila'}`;
          return (
            <li key={d} aria-label={label} className="flex flex-col items-center gap-1">
              <span
                aria-hidden
                className={cx(
                  'flex size-9 items-center justify-center rounded-full text-xs font-bold',
                  trained[i]
                    ? 'bg-accent text-accent-fg'
                    : planned[i]
                      ? cx('border-2', i < todayIdx ? 'border-border text-muted' : 'border-accent/60 text-fg')
                      : 'bg-surface-2/60 text-muted',
                  i === todayIdx && 'ring-2 ring-fg/30 ring-offset-2 ring-offset-surface',
                )}
              >
                {trained[i] && <Check size={16} strokeWidth={3} />}
              </span>
              <span aria-hidden className={cx('text-[0.65rem] font-bold', i === todayIdx ? 'text-fg' : 'text-muted')}>
                {d}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  return h < 5 ? 'God natt' : h < 10 ? 'God morgon' : h < 17 ? 'Hej' : 'God kväll';
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{children}</p>;
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
      {children}
    </h2>
  );
}

function QuickLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="card press flex min-h-24 flex-col justify-between gap-3 p-4 font-bold active:bg-surface-2">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-accent">
        {icon}
      </span>
      {children}
    </Link>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-black/25 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted">
        <span aria-hidden>{icon}</span>
        <span className="text-[0.7rem] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="tabular mt-0.5 text-xl font-extrabold">{value}</div>
    </div>
  );
}

function ActiveCard({ session, onContinue }: { session: WorkoutSession; onContinue: () => void }) {
  return (
    <div className="card-hero space-y-4 p-5">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
        </span>
        <Eyebrow>Pågående pass</Eyebrow>
      </div>
      <h2 className="text-3xl font-extrabold">{session.name || 'Pass'}</h2>
      <p className="text-muted">
        {session.exercises.length} {session.exercises.length === 1 ? 'övning' : 'övningar'} · startat {formatDate(session.startedAt)}
      </p>
      <Button variant="primary" size="xl" className="w-full" onClick={onContinue}>
        <Play aria-hidden size={24} fill="currentColor" /> Fortsätt pass
      </Button>
    </div>
  );
}

/** First thing a new account sees: build a weekly schedule or a single pass. */
function StartChoices() {
  const choice = 'press flex min-h-28 items-center gap-4 rounded-[1.75rem] border p-5 text-left';
  return (
    <section aria-labelledby="start-h" className="space-y-3">
      <h2 id="start-h" className="text-3xl font-black leading-tight">
        Hur vill du börja?
      </h2>
      <Link to="/skapa/schema" className={cx(choice, 'border-accent bg-accent text-accent-fg')}>
        <CalendarDays aria-hidden size={32} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-extrabold">Skapa schema</span>
          <span className="block text-sm text-accent-fg/75">Välj dagar och bygg ett pass för varje dag.</span>
        </span>
      </Link>
      <Link to="/skapa/pass" className={cx(choice, 'border-border bg-surface')}>
        <Dumbbell aria-hidden size={32} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-extrabold">Skapa gympass</span>
          <span className="block text-sm text-muted">Bygg dagens pass och kör direkt.</span>
        </span>
      </Link>
    </section>
  );
}

/** Saved passes, one tap to start, last run first. */
function YourPasses({
  templates,
  lastTemplateId,
  starting,
  onStart,
}: {
  templates: WorkoutTemplate[];
  lastTemplateId: string | null;
  starting: boolean;
  onStart: (templateId: string) => void;
}) {
  const ordered = lastTemplateId ? [...templates].sort((a, b) => Number(b.id === lastTemplateId) - Number(a.id === lastTemplateId)) : templates;
  return (
    <section className="mt-6" aria-labelledby="passes-h">
      <SectionTitle id="passes-h">Dina pass</SectionTitle>
      <ul className="space-y-2">
        {ordered.slice(0, 5).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              disabled={starting}
              onClick={() => onStart(t.id)}
              className="card press flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{t.name || 'Namnlöst pass'}</span>
                <span className="block text-sm text-muted">
                  {t.id === lastTemplateId ? 'Senast körd · ' : ''}
                  {summaryText(t)}
                </span>
              </span>
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
                <Play size={18} fill="currentColor" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {templates.length > 5 && (
        <Link to="/templates" className="mt-2 block py-2 text-center text-sm font-semibold text-accent">
          Alla {templates.length} pass
        </Link>
      )}
    </section>
  );
}

function TodayCard({
  template,
  programName,
  exercises,
  ready,
  starting,
  onStart,
}: {
  template: WorkoutTemplate;
  programName: string;
  exercises: Map<string, Exercise> | undefined;
  ready: Map<string, string>;
  starting: boolean;
  onStart: () => void;
}) {
  const n = template.exercises.length;
  const min = minutesFor(template);
  const sets = template.exercises.reduce((sum, te) => sum + te.sets, 0);
  return (
    <section className="card-hero space-y-5 p-5" aria-label={`Idag: ${template.name} – ${summaryText(template)}`}>
      <div className="space-y-1">
        <Eyebrow>Idag · {programName}</Eyebrow>
        <h2 className="text-4xl font-black leading-tight">{template.name}</h2>
      </div>
      <div className="flex gap-2">
        <Stat icon={<Dumbbell size={14} />} value={String(n)} label={n === 1 ? 'Övning' : 'Övningar'} />
        <Stat icon={<Layers size={14} />} value={String(sets)} label="Set" />
        {min ? <Stat icon={<Clock size={14} />} value={`${min}`} label="Min" /> : null}
      </div>
      {n > 0 && (
        <ol className="space-y-1" aria-label="Övningar i dagens pass">
          {template.exercises.map((te, i) => {
            const ex = exercises?.get(te.exerciseId);
            const reason = ready.get(te.exerciseId);
            const inSuperset = !!te.supersetGroup;
            const reps = te.repMin === te.repMax ? `${te.repMin}` : `${te.repMin}–${te.repMax}`;
            const unit = ex?.measure === 'time' ? ' s' : '';
            return (
              <li key={te.id} className="flex min-h-11 items-center gap-3">
                <span
                  aria-hidden
                  className={cx(
                    'tabular flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    inSuperset ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{ex?.name ?? 'Okänd övning'}</span>
                {reason && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-accent-fg"
                    title={reason}
                    aria-label={`Redo att höja: ${reason}`}
                  >
                    <TrendingUp aria-hidden size={12} strokeWidth={3} /> Höj
                  </span>
                )}
                <span className="tabular shrink-0 text-sm font-medium text-muted">
                  {te.sets} × {reps}
                  {unit}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {ready.size > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
          <TrendingUp aria-hidden size={16} /> {ready.size} {ready.size === 1 ? 'övning är' : 'övningar är'} redo att höja
        </p>
      )}
      <Button variant="primary" size="xl" className="w-full" onClick={onStart} disabled={starting}>
        <Play aria-hidden size={24} fill="currentColor" /> {starting ? 'Startar…' : 'Starta passet'}
      </Button>
    </section>
  );
}
