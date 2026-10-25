import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateMinutes, scheduledTemplateId, suggestNext, upcomingSchedule } from '@/engine';
import type { Exercise, Program, Settings, WorkoutSession, WorkoutTemplate } from '@/engine';
import { getExerciseHistory } from '@/db/repo';
import { useActiveSession, useCompletedSessions, useExerciseMap, usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { Button, Card, EmptyState, Page, Sheet, cx } from '@/ui';
import { formatDate, formatLongDate } from '@/lib/format';
import { startSession } from '@/features/workout/start';
import { BookOpen, CalendarDays, Clock, Dumbbell, Layers, Play, Plus, TrendingUp } from 'lucide-react';

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
        <QuickStartCard
          templates={templates ?? []}
          lastTemplateId={completed?.find((s) => s.templateId && templateMap.has(s.templateId))?.templateId ?? null}
          starting={starting}
          onStart={(id) => void start(id, null)}
        />
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
          <p className="text-muted">Inget pass planerat idag. Vila och återhämta dig – eller kör ändå.</p>
          <Button size="lg" className="w-full" onClick={() => setPickOpen(true)} disabled={starting}>
            <Dumbbell aria-hidden size={20} /> Träna ändå
          </Button>
        </Card>
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

      {!loading && (
        <section className="mt-6" aria-labelledby="quick-h">
          <SectionTitle id="quick-h">Snabbval</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {!active && (
              <Button className="col-span-2" size="lg" onClick={() => void start(null, null)} disabled={starting}>
                <Plus aria-hidden size={20} /> Starta tomt pass
              </Button>
            )}
            <QuickLink to="/programs" icon={<Layers size={20} />}>{program ? 'Byt program' : 'Välj program'}</QuickLink>
            <QuickLink to="/exercises" icon={<BookOpen size={20} />}>Övningar</QuickLink>
          </div>
        </section>
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
            to="/templates"
            className="press flex min-h-12 items-center justify-center rounded-2xl border border-border px-4 font-semibold"
          >
            Alla passmallar
          </Link>
        </div>
      </Sheet>
    </Page>
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

/** No active program: start any template with one tap, last used first. */
function QuickStartCard({
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
  const [showAll, setShowAll] = useState(false);
  const ordered = lastTemplateId
    ? [...templates].sort((a, b) => Number(b.id === lastTemplateId) - Number(a.id === lastTemplateId))
    : templates;
  const visible = showAll ? ordered : ordered.slice(0, 4);
  return (
    <section className="card-hero space-y-4 p-5" aria-labelledby="quickstart-h">
      <div className="space-y-1">
        <Eyebrow>Snabbstart</Eyebrow>
        <h2 id="quickstart-h" className="text-3xl font-extrabold">
          Vad kör du idag?
        </h2>
      </div>
      {templates.length === 0 ? (
        <p className="text-muted">
          Du har inga passmallar än. <Link className="text-accent underline" to="/templates">Skapa en</Link> eller starta ett tomt pass nedan.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={starting}
                onClick={() => onStart(t.id)}
                className="press flex min-h-16 w-full items-center gap-3 rounded-2xl bg-black/25 px-4 py-2 text-left active:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold">{t.name}</span>
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
      )}
      {ordered.length > 4 && (
        <Button size="lg" variant="ghost" className="w-full" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Visa färre' : `Visa alla ${ordered.length} pass`}
        </Button>
      )}
      <p className="flex items-start gap-2 text-sm text-muted">
        <CalendarDays aria-hidden size={16} className="mt-0.5 shrink-0" />
        <span>
          Tips: <Link className="font-semibold text-accent" to="/programs">välj ett program</Link> så visas dagens pass här automatiskt.
        </span>
      </p>
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
