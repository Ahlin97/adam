import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateMinutes, scheduledTemplateId, suggestNext, upcomingSchedule } from '@/engine';
import type { Exercise, Program, Settings, WorkoutSession, WorkoutTemplate } from '@/engine';
import { getExerciseHistory } from '@/db/repo';
import { useActiveSession, useCompletedSessions, useExerciseMap, usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { Button, Card, EmptyState, Page, Sheet, cx } from '@/ui';
import { formatDate, formatLongDate } from '@/lib/format';
import { startSession } from '@/features/workout/start';

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
      <p className="mb-4 text-sm text-muted first-letter:uppercase">{formatLongDate(today)}</p>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-bad/20 p-3 text-bad">
          {error}
        </p>
      )}

      {loading ? null : active ? (
        <ActiveCard session={active} onContinue={() => navigate('/workout')} />
      ) : !program ? (
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Inget aktivt program</h2>
          <p className="text-muted">Välj ett program så visar vi dagens pass och vad som står på tur.</p>
          <Link
            to="/programs"
            className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-5 text-lg font-semibold text-accent-fg"
          >
            Välj program
          </Link>
        </Card>
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
        <Card className="space-y-3">
          <p className="text-sm text-muted">{program.name}</p>
          <h2 className="text-2xl font-bold">Vilodag</h2>
          <p className="text-muted">Inget pass planerat idag. Vila och återhämta dig – eller kör ändå.</p>
          <Button size="lg" className="w-full" onClick={() => setPickOpen(true)} disabled={starting}>
            Träna ändå
          </Button>
        </Card>
      )}

      {!loading && program && upcoming.length > 0 && (
        <section className="mt-6" aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" className="mb-2 text-lg font-bold">
            Står på tur
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {upcoming.map((u, i) => {
              const t = templateMap.get(u.templateId);
              return (
                <li key={`${u.templateId}-${i}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="w-24 shrink-0 text-sm text-muted first-letter:uppercase">{formatDate(u.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t?.name ?? 'Okänd mall'}</span>
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
          <h2 id="quick-h" className="mb-2 text-lg font-bold">
            Snabbval
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {!active && (
              <Button className="col-span-2" size="lg" onClick={() => void start(null, null)} disabled={starting}>
                Starta tomt pass
              </Button>
            )}
            <QuickLink to="/templates">Välj passmall</QuickLink>
            <QuickLink to="/programs">Program</QuickLink>
            <QuickLink to="/exercises">Övningar</QuickLink>
            <QuickLink to="/history">Historik</QuickLink>
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
              className="flex min-h-14 w-full flex-col items-start justify-center rounded-xl bg-surface-2 px-4 py-2 text-left active:bg-border"
            >
              <span className="font-semibold">{t.name}</span>
              <span className="text-sm text-muted">{summaryText(t)}</span>
            </button>
          ))}
          <Link
            to="/templates"
            className="flex min-h-12 items-center justify-center rounded-xl border border-border px-4 font-semibold"
          >
            Alla passmallar
          </Link>
        </div>
      </Sheet>
    </Page>
  );
}

function QuickLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex min-h-14 items-center justify-center rounded-xl border border-border bg-surface-2 px-3 text-center font-semibold active:bg-border"
    >
      {children}
    </Link>
  );
}

function ActiveCard({ session, onContinue }: { session: WorkoutSession; onContinue: () => void }) {
  return (
    <Card className="space-y-3 border-good">
      <p className="text-sm text-muted">Pågående pass</p>
      <h2 className="text-2xl font-bold">{session.name || 'Pass'}</h2>
      <p className="text-muted">
        {session.exercises.length} {session.exercises.length === 1 ? 'övning' : 'övningar'} · startat {formatDate(session.startedAt)}
      </p>
      <Button variant="good" size="xl" className="w-full" onClick={onContinue}>
        Fortsätt pass
      </Button>
    </Card>
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
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-sm text-muted">{programName}</p>
        <h2 className="text-2xl font-bold">
          Idag: {template.name} – {summaryText(template)}
        </h2>
      </div>
      {template.exercises.length > 0 && (
        <ol className="space-y-1" aria-label="Övningar i dagens pass">
          {template.exercises.map((te) => {
            const ex = exercises?.get(te.exerciseId);
            const reason = ready.get(te.exerciseId);
            const inSuperset = !!te.supersetGroup;
            const reps = te.repMin === te.repMax ? `${te.repMin}` : `${te.repMin}–${te.repMax}`;
            const unit = ex?.measure === 'time' ? ' s' : '';
            return (
              <li key={te.id} className={cx('flex min-h-10 items-center gap-2', inSuperset && 'border-l-2 border-accent pl-3')}>
                <span className="min-w-0 flex-1 truncate">{ex?.name ?? 'Okänd övning'}</span>
                {reason && (
                  <span
                    className="shrink-0 rounded-full bg-good/20 px-2 py-0.5 text-sm font-bold text-good"
                    title={reason}
                    aria-label={`Redo att höja: ${reason}`}
                  >
                    ↑
                  </span>
                )}
                <span className="tabular shrink-0 text-sm text-muted">
                  {te.sets} × {reps}
                  {unit}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {ready.size > 0 && (
        <p className="text-sm text-good">
          ↑ {ready.size} {ready.size === 1 ? 'övning är' : 'övningar är'} redo att höja
        </p>
      )}
      <Button variant="primary" size="xl" className="w-full" onClick={onStart} disabled={starting}>
        {starting ? 'Startar…' : 'Starta passet'}
      </Button>
    </Card>
  );
}
