// The active session logger. All state that matters lives in IndexedDB (session, sets, rest timer);
// React state only holds transient UI (which sheet is open, the set being edited before "Klar").
import { Check, ChevronLeft, Flag, History, MoreHorizontal, Plus, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, NextSet, SessionExercise, SetEntry, SetType, Settings, WorkoutSession } from '@/engine';
import { useActiveSession, useExerciseMap, useSessionSets, useSettings } from '@/db/hooks';
import { getExerciseHistory } from '@/db/repo';
import { Button, Card, Field, Page, Sheet, cx, inputClass } from '@/ui';
import { formatDuration } from '@/lib/format';
import ExercisePicker from '@/features/library/ExercisePicker';
import {
  addExerciseToSession,
  addPlannedSet,
  deleteSet,
  discardSession,
  finishSession,
  logSet,
  moveExercise,
  removeExercise,
  removePlannedSet,
  replaceExercise,
  startSession,
  updateSession,
  updateSessionExercise,
  updateSet,
} from './start';
import { safeNextSet, safeNextSetFor, stepFor } from './safeEngine';
import { NumberStepper, RpePicker, SetTypePicker, TypeBadge, WeightStepper } from './inputs';
import { isBodyweight, isTime, lastTimeText, setText, weightLabel, weightText } from './setFormat';
import { SetEditSheet } from './SetEditSheet';
import PlateCalculator from './PlateCalculator';
import { RestDoneOverlay, RestTimerPanel } from './RestTimer';
import { clearRest, startRest, useRestTimer } from './restTimer';
import { unlockAudio } from './alerts';
import { useWakeLock } from './useWakeLock';
import { TimeTool } from './TimeTool';

export default function WorkoutPage() {
  const session = useActiveSession();
  const sets = useSessionSets(session?.id);
  const exMap = useExerciseMap();
  const settings = useSettings();

  if (session === undefined || (session && (!sets || !exMap))) {
    return <div className="p-6 text-center text-muted" aria-busy="true">Laddar pass…</div>;
  }
  if (!session) return <NoSession />;
  return <ActiveWorkout session={session} sets={sets!} exMap={exMap!} settings={settings} />;
}

function NoSession() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Page title="Pass" back="/">
      <div className="space-y-4">
        <Card>
          <p className="text-lg font-semibold">Inget pågående pass</p>
          <p className="mt-1 text-muted">Starta ett tomt pass och lägg till övningar medan du tränar, eller välj en passmall.</p>
        </Card>
        <Button
          variant="primary"
          size="xl"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await startSession({ templateId: null, programId: null });
            } finally {
              setBusy(false);
            }
          }}
        >
          Starta tomt pass
        </Button>
        <Button size="lg" className="w-full" onClick={() => navigate('/templates')}>
          Välj passmall
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate('/')}>
          Till startsidan
        </Button>
      </div>
    </Page>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

type PickerMode = { kind: 'add' } | { kind: 'replace'; seId: string } | null;

const exName = (exMap: Map<string, Exercise>, id: string) => exMap.get(id)?.name ?? 'Okänd övning';

/** Default weight the first time an exercise is performed. */
function firstTimeWeight(ex: Exercise | undefined, settings: Settings): number {
  if (!ex) return 10;
  if (isTime(ex) || isBodyweight(ex)) return 0;
  if (ex.equipment === 'barbell') return settings.barWeight;
  return 10;
}

interface Current {
  next: NextSet;
  se: SessionExercise;
  /** Prefilled weight in kg. */
  weight: number;
  firstTime: boolean;
}

function computeCurrent(
  session: WorkoutSession,
  sets: SetEntry[],
  focusId: string | null,
  exMap: Map<string, Exercise>,
  settings: Settings,
): Current | null {
  const next = focusId ? safeNextSetFor(session, sets, focusId) : safeNextSet(session, sets);
  if (!next) return null;
  const se = session.exercises.find((e) => e.id === next.sessionExerciseId);
  if (!se) return null;
  const ex = exMap.get(se.exerciseId);
  const own = sets.filter((s) => s.sessionExerciseId === se.id);
  const lastSameType = [...own].reverse().find((s) => s.type === next.type);
  let weight: number;
  let firstTime = false;
  if (next.type === 'working' && lastSameType) weight = lastSameType.weight;
  else if (next.weight != null) weight = next.weight;
  else if (own.length) weight = own[own.length - 1].weight;
  else {
    weight = firstTimeWeight(ex, settings);
    firstTime = !isTime(ex);
  }
  return { next, se, weight, firstTime };
}

function nextLabel(n: NextSet | null, session: WorkoutSession, sets: SetEntry[], exMap: Map<string, Exercise>, settings: Settings): string {
  if (!n) return '';
  const c = computeCurrent(session, sets, n.sessionExerciseId, exMap, settings);
  const ex = exMap.get(n.exerciseId);
  const w = c?.weight ?? n.weight ?? 0;
  if (isTime(ex)) return `${ex?.name ?? ''} ${n.reps} s`;
  return `${exName(exMap, n.exerciseId)} ${n.reps} × ${weightText(w, ex, settings.unit)}`;
}

function ActiveWorkout({
  session,
  sets,
  exMap,
  settings,
}: {
  session: WorkoutSession;
  sets: SetEntry[];
  exMap: Map<string, Exercise>;
  settings: Settings;
}) {
  const navigate = useNavigate();
  const now = useNow(1000);
  const wake = useWakeLock(true);
  const rest = useRestTimer(session.id, settings);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [exMenu, setExMenu] = useState<string | null>(null);
  const [editSet, setEditSet] = useState<SetEntry | null>(null);
  const [plates, setPlates] = useState<{ kg?: number } | null>(null);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [announce, setAnnounce] = useState('');

  // Drop focus if the focused exercise disappeared.
  const validFocus = focusId && session.exercises.some((e) => e.id === focusId) ? focusId : null;
  const current = computeCurrent(session, sets, validFocus, exMap, settings);
  const focusDone = validFocus && !current;

  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomH, setBottomH] = useState(0);
  useLayoutEffect(() => {
    const el = bottomRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBottomH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onConfirm = useCallback(
    async (cur: Current, values: { type: SetType; reps: number; weight: number; durationSec: number | null; rpe: number | null }) => {
      unlockAudio();
      const entry = await logSet({
        sessionId: session.id,
        sessionExerciseId: cur.se.id,
        exerciseId: cur.se.exerciseId,
        ...values,
      });
      try {
        navigator.vibrate?.(30);
      } catch {
        /* ignore */
      }
      const newSets = [...sets, entry];
      const doneFor = (se: SessionExercise) => newSets.filter((s) => s.sessionExerciseId === se.id).length;
      const hasRemaining = (se: SessionExercise) => doneFor(se) < se.warmupSets + se.sets;

      // Superset handling: alternate between the group's exercises, rest only after the last one.
      let nextFocus: string | null = validFocus && hasRemaining(cur.se) ? cur.se.id : null;
      let skipRest = false;
      if (cur.se.supersetGroup) {
        const group = session.exercises.filter((e) => e.supersetGroup === cur.se.supersetGroup);
        const idx = group.findIndex((e) => e.id === cur.se.id);
        const later = group.slice(idx + 1).find(hasRemaining);
        if (later) {
          nextFocus = later.id;
          skipRest = true;
        } else {
          const first = group.find(hasRemaining);
          nextFocus = first ? first.id : null;
        }
      }
      setFocusId(nextFocus);

      const next = nextFocus ? safeNextSetFor(session, newSets, nextFocus) : safeNextSet(session, newSets);
      const doneMsg = `Set sparat: ${setText(entry, exMap.get(entry.exerciseId), settings.unit)}`;
      setAnnounce(doneMsg);
      if (skipRest || !next) {
        await clearRest();
        return;
      }
      let restSec = cur.se.restSec > 0 ? cur.se.restSec : settings.defaultRestSec;
      if (values.type === 'warmup') restSec = Math.min(restSec, 60);
      if (restSec > 0) await startRest(session.id, restSec, nextLabel(next, session, newSets, exMap, settings));
    },
    [session, sets, exMap, settings, validFocus],
  );

  const menuSe = exMenu ? session.exercises.find((e) => e.id === exMenu) : undefined;
  const editEx = editSet ? exMap.get(editSet.exerciseId) : undefined;
  const elapsed = formatDuration((now - new Date(session.startedAt).getTime()) / 1000);
  const totalLogged = sets.length;

  return (
    <div className="mx-auto max-w-xl">
      <header className="pt-safe glass sticky top-0 z-20 border-b border-white/5">
        <div className="flex min-h-14 items-center gap-2 px-2">
          <button
            type="button"
            aria-label="Till startsidan (passet fortsätter)"
            className="press flex min-h-11 min-w-11 items-center justify-center rounded-full bg-surface-2 active:bg-border"
            onClick={() => navigate('/')}
          >
            <ChevronLeft aria-hidden size={22} strokeWidth={2.5} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight">{session.name}</h1>
            <div className="tabular flex items-center gap-1.5 text-sm font-medium text-muted" aria-label={`Tid: ${elapsed}`}>
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
              {elapsed} · {totalLogged} set
            </div>
          </div>
          <Button variant="ghost" aria-label="Passmeny" onClick={() => setSessionMenu(true)} className="min-w-11 rounded-full px-0">
            <MoreHorizontal aria-hidden size={22} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFinishOpen(true)} className="rounded-full px-4">
            <Flag aria-hidden size={16} /> Avsluta
          </Button>
        </div>
      </header>

      <main className="space-y-3 px-3 py-3" style={{ paddingBottom: bottomH + 24 }}>
        {!wake.supported && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            Din webbläsare kan inte hålla skärmen tänd – ändra skärmlås i telefonens inställningar vid behov.
          </p>
        )}
        {session.notes && (
          <button type="button" className="w-full rounded-xl bg-surface-2 px-3 py-2 text-left text-sm" onClick={() => setSessionMenu(true)}>
            📝 {session.notes}
          </button>
        )}

        {session.exercises.length === 0 && (
          <Card className="text-center">
            <p className="font-semibold">Passet är tomt</p>
            <p className="mt-1 text-sm text-muted">Lägg till den första övningen för att börja logga.</p>
          </Card>
        )}

        <ol className="space-y-2" aria-label="Övningar i passet">
          {session.exercises.map((se, i) => {
            const ex = exMap.get(se.exerciseId);
            const logged = sets.filter((s) => s.sessionExerciseId === se.id);
            const total = se.warmupSets + se.sets;
            const isCurrent = current?.se.id === se.id;
            const complete = logged.length >= total;
            const prev = session.exercises[i - 1];
            const nxt = session.exercises[i + 1];
            const inSuperset = !!se.supersetGroup && (prev?.supersetGroup === se.supersetGroup || nxt?.supersetGroup === se.supersetGroup);
            return (
              <li key={se.id}>
                <div
                  className={cx(
                    'card',
                    isCurrent && 'border-accent/70! shadow-[0_0_0_1px_rgb(212_255_58/0.35),0_12px_32px_-18px_rgb(212_255_58/0.5)]!',
                    complete && !isCurrent && 'opacity-70',
                    inSuperset && 'border-l-4! border-l-accent/60!',
                  )}
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-l-[1.5rem] px-3 py-2 text-left active:bg-surface-2"
                      onClick={() => setFocusId(se.id)}
                      aria-label={`${ex?.name ?? 'Övning'}, ${logged.length} av ${total} set. Logga denna övning`}
                    >
                      <span
                        aria-hidden
                        className={cx(
                          'tabular flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold',
                          complete ? 'bg-accent text-accent-fg' : isCurrent ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted',
                        )}
                      >
                        {complete ? <Check size={18} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-bold">{ex?.name ?? 'Okänd övning'}</span>
                          {se.suggestion?.readyToIncrease && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-accent-fg" title="Redo att höja">
                              <TrendingUp aria-hidden size={12} strokeWidth={3} /> Höj
                            </span>
                          )}
                        </span>
                        <span className="block text-sm text-muted">
                          {logged.length}/{total} set
                          {inSuperset && ' · Superset'}
                          {se.notes && ' · 📝'}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex min-h-16 min-w-12 items-center justify-center rounded-r-[1.5rem] text-muted active:bg-surface-2"
                      aria-label={`Meny för ${ex?.name ?? 'övning'}`}
                      onClick={() => setExMenu(se.id)}
                    >
                      <MoreHorizontal aria-hidden size={22} />
                    </button>
                  </div>
                  {logged.length > 0 && (
                    <ul className="flex flex-wrap gap-2 px-3 pb-3" aria-label="Loggade set">
                      {logged.map((s, k) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={cx(
                              'press tabular min-h-10 rounded-full px-3 text-sm font-semibold',
                              s.type === 'warmup' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-fg',
                            )}
                            onClick={() => setEditSet(s)}
                            aria-label={`Set ${k + 1}: ${setText(s, ex, settings.unit)}. Tryck för att ändra`}
                          >
                            {s.type === 'warmup' ? 'U ' : s.type === 'drop' ? 'D ' : s.type === 'failure' ? 'F ' : ''}
                            {setText(s, ex, settings.unit)}
                            {s.rpe != null && <span className="text-muted"> @{String(s.rpe).replace('.', ',')}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <Button size="lg" variant="ghost" className="w-full border border-dashed border-border" onClick={() => setPicker({ kind: 'add' })}>
          <Plus aria-hidden size={20} /> Lägg till övning
        </Button>
      </main>

      <div ref={bottomRef} className="pb-safe glass fixed inset-x-0 bottom-0 z-30 rounded-t-[2rem] border-t border-white/8 shadow-[0_-16px_40px_-20px_rgb(0_0_0/0.9)]">
        <div className="mx-auto max-w-xl space-y-2 p-2">
          {rest.phase === 'running' && rest.state && <RestTimerPanel state={rest.state} remainingMs={rest.remainingMs} />}
          {current ? (
            <CurrentSetCard
              key={`${current.se.id}:${current.next.setNumber}:${sets.length}`}
              current={current}
              exercise={exMap.get(current.se.exerciseId)}
              sessionId={session.id}
              settings={settings}
              onConfirm={onConfirm}
            />
          ) : focusDone ? (
            <Card className="space-y-3 text-center">
              <p className="font-semibold">Alla set klara för {exName(exMap, session.exercises.find((e) => e.id === validFocus)!.exerciseId)}</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void addPlannedSet(session.id, validFocus!)}>
                  + Extra set
                </Button>
                <Button variant="primary" className="flex-1" onClick={() => setFocusId(null)}>
                  Nästa övning
                </Button>
              </div>
            </Card>
          ) : session.exercises.length === 0 ? (
            <Button variant="primary" size="xl" className="w-full" onClick={() => setPicker({ kind: 'add' })}>
              + Lägg till övning
            </Button>
          ) : (
            <Card className="space-y-3 text-center">
              <p className="text-lg font-bold">Alla set är klara! 💪</p>
              <p className="text-sm text-muted">Tryck på en övning för att lägga till fler set, eller avsluta passet.</p>
              <Button variant="good" size="xl" className="w-full" onClick={() => setFinishOpen(true)}>
                Avsluta passet
              </Button>
            </Card>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <RestDoneOverlay phase={rest.phase} state={rest.state} />

      {/* ---------- Sheets ---------- */}
      <ExercisePicker
        open={picker !== null}
        title={picker?.kind === 'replace' ? 'Byt ut övning' : 'Lägg till övning'}
        onClose={() => setPicker(null)}
        onPick={async (exercise: Exercise) => {
          const mode = picker;
          setPicker(null);
          if (mode?.kind === 'replace') {
            const id = await replaceExercise(session.id, mode.seId, exercise);
            if (id) setFocusId(id);
          } else {
            const id = await addExerciseToSession(session.id, exercise);
            setFocusId(id);
          }
        }}
      />

      {menuSe && (
        <ExerciseMenu
          key={menuSe.id}
          se={menuSe}
          session={session}
          exercise={exMap.get(menuSe.exerciseId)}
          settings={settings}
          loggedCount={sets.filter((s) => s.sessionExerciseId === menuSe.id).length}
          onClose={() => setExMenu(null)}
          onReplace={() => {
            setExMenu(null);
            setPicker({ kind: 'replace', seId: menuSe.id });
          }}
          onPlates={(kg) => {
            setExMenu(null);
            setPlates({ kg });
          }}
          suggestedKg={current?.se.id === menuSe.id ? current.weight : (menuSe.suggestion?.weight ?? undefined)}
        />
      )}

      <SetEditSheet
        open={!!editSet}
        onClose={() => setEditSet(null)}
        title={editSet ? `Ändra set – ${editEx?.name ?? ''}` : 'Ändra set'}
        initial={
          editSet
            ? { type: editSet.type, reps: editSet.reps, weight: editSet.weight, durationSec: editSet.durationSec, rpe: editSet.rpe }
            : { type: 'working', reps: 0, weight: 0, durationSec: null, rpe: null }
        }
        exercise={editEx}
        settings={settings}
        onSave={async (v) => {
          if (editSet) await updateSet({ ...editSet, ...v });
        }}
        onDelete={async () => {
          if (editSet) await deleteSet(editSet.id);
        }}
      />

      <PlateCalculator open={!!plates} onClose={() => setPlates(null)} initialKg={plates?.kg} />

      <SessionMenu
        open={sessionMenu}
        onClose={() => setSessionMenu(false)}
        session={session}
        onPlates={() => {
          setSessionMenu(false);
          setPlates({ kg: current?.weight });
        }}
        onDiscard={async () => {
          await discardSession(session.id);
          navigate('/');
        }}
      />

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Avsluta passet?">
        {finishOpen && (
          <div className="space-y-4">
            {totalLogged === 0 ? (
              <>
                <p className="text-muted">Du har inte loggat några set. Vill du radera passet i stället?</p>
                <Button
                  variant="danger"
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    await discardSession(session.id);
                    navigate('/');
                  }}
                >
                  Radera passet
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted">
                  {totalLogged} set loggade på {elapsed}.
                  {current && ' Det finns set kvar som inte är gjorda – de hoppas över.'}
                </p>
                <Button
                  variant="good"
                  size="xl"
                  className="w-full"
                  onClick={async () => {
                    await finishSession(session.id);
                    navigate(`/workout/summary/${session.id}`);
                  }}
                >
                  Avsluta och spara
                </Button>
              </>
            )}
            <Button size="lg" className="w-full" onClick={() => setFinishOpen(false)}>
              Fortsätt träna
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------- Current set card ----------

function CurrentSetCard({
  current,
  exercise,
  sessionId,
  settings,
  onConfirm,
}: {
  current: Current;
  exercise: Exercise | undefined;
  sessionId: string;
  settings: Settings;
  onConfirm: (cur: Current, v: { type: SetType; reps: number; weight: number; durationSec: number | null; rpe: number | null }) => Promise<void>;
}) {
  const { next, se } = current;
  const time = isTime(exercise);
  const [weight, setWeight] = useState(current.weight);
  const [reps, setReps] = useState(next.reps);
  const [type, setType] = useState<SetType>(next.type);
  const [rpe, setRpe] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const history = useLiveQuery(() => getExerciseHistory(se.exerciseId, sessionId), [se.exerciseId, sessionId]);
  const last = lastTimeText(history?.[0], exercise, settings.unit);
  const step = exercise ? stepFor(exercise, settings) : 2.5;
  const suggestion = se.suggestion;
  const showReason = suggestion?.reason && next.type === 'working' && suggestion.kind !== 'first_time';
  const showWeight = !time;

  return (
    <section aria-label="Nästa set" className="px-1 pt-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-black leading-tight">{exercise?.name ?? 'Okänd övning'}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="tabular rounded-full bg-surface-2 px-2.5 py-0.5 font-bold">
              Set {next.setNumber} av {Math.max(next.totalSets, next.setNumber)}
            </span>
            <TypeBadge type={type} />
            {se.targetRpe != null && <span className="text-muted">mål-RPE {String(se.targetRpe).replace('.', ',')}</span>}
          </div>
        </div>
        <Button size="sm" variant="secondary" className="rounded-full" aria-expanded={more} aria-label={more ? 'Färre val' : 'Fler val'} onClick={() => setMore((m) => !m)}>
          <SlidersHorizontal aria-hidden size={16} /> {more ? 'Färre' : 'Mer'}
        </Button>
      </div>

      <div className="mt-2 space-y-1 text-sm">
        {showReason && (
          <p
            className={cx(
              'rounded-xl px-3 py-1.5 font-semibold',
              suggestion!.readyToIncrease ? 'bg-accent/12 text-accent' : suggestion!.kind === 'deload' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-fg',
            )}
          >
            {suggestion!.reason}
          </p>
        )}
        {suggestion?.plateau && <p className="text-warn">Platå – överväg deload eller nytt repsintervall.</p>}
        {last ? (
          <p className="flex items-center gap-1.5 px-1 text-muted">
            <History aria-hidden size={14} /> Förra gången: <span className="font-semibold text-fg">{last}</span>
          </p>
        ) : null}
        {current.firstTime && <p className="font-semibold text-warn">Första gången – välj en startvikt.</p>}
      </div>

      {more && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2/50 p-3">
          <SetTypePicker value={type} onChange={setType} />
          <div>
            <div className="mb-1 text-xs text-muted">RPE (valfritt)</div>
            <RpePicker value={rpe} onChange={setRpe} />
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {showWeight && <WeightStepper label={weightLabel(exercise, settings.unit)} kg={weight} stepKg={step} unit={settings.unit} onChange={setWeight} />}
        {time ? (
          <>
            <NumberStepper label="Tid (sekunder)" value={reps} step={5} suffix="s" decimals={0} onChange={(v) => setReps(Math.round(v))} />
            <TimeTool target={reps} onResult={setReps} sound={settings.soundEnabled} vibration={settings.vibrationEnabled} />
          </>
        ) : (
          <NumberStepper label="Reps" value={reps} step={1} decimals={0} onChange={(v) => setReps(Math.round(v))} />
        )}
      </div>

      <Button
        variant="good"
        size="xl"
        className="mt-3 mb-1 min-h-20 w-full text-3xl font-black"
        disabled={saving || reps <= 0}
        aria-label={`Klar: ${time ? `${reps} sekunder` : `${reps} reps`}${showWeight ? `, ${weightText(weight, exercise, settings.unit)}` : ''}`}
        onClick={async () => {
          unlockAudio();
          setSaving(true);
          try {
            await onConfirm(current, {
              type,
              reps: time ? 0 : reps,
              weight: time ? 0 : weight,
              durationSec: time ? reps : null,
              rpe,
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Check aria-hidden size={30} strokeWidth={3.5} /> Klar
      </Button>
    </section>
  );
}

// ---------- Per-exercise menu ----------

function ExerciseMenu({
  se,
  session,
  exercise,
  settings,
  loggedCount,
  onClose,
  onReplace,
  onPlates,
  suggestedKg,
}: {
  se: SessionExercise;
  session: WorkoutSession;
  exercise: Exercise | undefined;
  settings: Settings;
  loggedCount: number;
  onClose: () => void;
  onReplace: () => void;
  onPlates: (kg?: number) => void;
  suggestedKg?: number;
}) {
  const [notes, setNotes] = useState(se.notes);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const idx = session.exercises.findIndex((e) => e.id === se.id);
  const saveNotes = () => {
    if (notes !== se.notes) void updateSessionExercise(session.id, se.id, { notes });
  };
  const close = () => {
    saveNotes();
    onClose();
  };
  const planned = se.warmupSets + se.sets;

  return (
    <Sheet open onClose={close} title={exercise?.name ?? 'Övning'}>
      <div className="space-y-4">
        {exercise?.notes && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{exercise.notes}</p>}
        <Field label="Anteckning för övningen">
          <textarea className={cx(inputClass, 'min-h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
        </Field>

        <div>
          <div className="mb-2 text-sm text-muted">
            Set: {loggedCount} loggade av {planned} planerade
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void addPlannedSet(session.id, se.id)}>
              + Lägg till set
            </Button>
            <Button className="flex-1" disabled={planned <= loggedCount || se.sets <= 0} onClick={() => void removePlannedSet(session.id, se.id)}>
              − Ta bort set
            </Button>
          </div>
        </div>

        <NumberStepper
          label="Vila mellan set (sekunder)"
          value={se.restSec || settings.defaultRestSec}
          step={15}
          suffix="s"
          decimals={0}
          size="md"
          onChange={(v) => void updateSessionExercise(session.id, se.id, { restSec: Math.max(0, Math.round(v)) })}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button disabled={idx <= 0} onClick={() => void moveExercise(session.id, se.id, -1)}>
            ↑ Flytta upp
          </Button>
          <Button disabled={idx >= session.exercises.length - 1} onClick={() => void moveExercise(session.id, se.id, 1)}>
            ↓ Flytta ner
          </Button>
          <Button onClick={onReplace}>⇄ Byt ut</Button>
          <Button onClick={() => onPlates(suggestedKg)}>Skivkalkylator</Button>
        </div>

        {confirmRemove ? (
          <div className="space-y-2">
            <p className="text-sm">
              Ta bort {exercise?.name ?? 'övningen'} från passet{loggedCount ? ` och radera ${loggedCount} loggade set` : ''}?
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setConfirmRemove(false)}>
                Avbryt
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  await removeExercise(session.id, se.id);
                  onClose();
                }}
              >
                Ja, ta bort
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmRemove(true)}>
            Ta bort övningen
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Session menu ----------

function SessionMenu({
  open,
  onClose,
  session,
  onPlates,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  session: WorkoutSession;
  onPlates: () => void;
  onDiscard: () => Promise<void>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Passet">
      {open && <SessionMenuBody session={session} onClose={onClose} onPlates={onPlates} onDiscard={onDiscard} />}
    </Sheet>
  );
}

function SessionMenuBody({
  session,
  onClose,
  onPlates,
  onDiscard,
}: {
  session: WorkoutSession;
  onClose: () => void;
  onPlates: () => void;
  onDiscard: () => Promise<void>;
}) {
  const [name, setName] = useState(session.name);
  const [notes, setNotes] = useState(session.notes);
  const [confirm, setConfirm] = useState(false);
  const save = () => {
    if (name.trim() !== session.name || notes !== session.notes) void updateSession(session.id, { name: name.trim() || session.name, notes });
  };
  return (
    <div className="space-y-4">
      <Field label="Namn">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
      </Field>
      <Field label="Anteckning för passet">
        <textarea className={cx(inputClass, 'min-h-24 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
      </Field>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => {
          save();
          onClose();
        }}
      >
        Spara
      </Button>
      <Button size="lg" className="w-full" onClick={onPlates}>
        Skivkalkylator
      </Button>
      {confirm ? (
        <div className="space-y-2">
          <p className="text-sm">Radera hela passet och alla loggade set? Det går inte att ångra.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirm(false)}>
              Avbryt
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => void onDiscard()}>
              Ja, radera
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirm(true)}>
          Avbryt och radera passet
        </Button>
      )}
    </div>
  );
}
