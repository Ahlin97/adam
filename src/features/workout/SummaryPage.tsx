// Post-session summary: duration, sets, volume, personal records and the logged exercises.
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, NotebookPen, Trophy } from 'lucide-react';
import { upcomingSchedule } from '@/engine';
import type { Exercise, Program, SetEntry, Unit, WorkoutSession } from '@/engine';
import { db } from '@/db/db';
import { getSessionSets, strip } from '@/db/repo';
import { useCompletedSessions, useExerciseMap, usePrograms, useSession, useSessionSets, useSettings, useTemplates } from '@/db/hooks';
import { Button, Card, EmptyState, Page, cx } from '@/ui';
import { formatDate, formatLongDate, formatSessionLength } from '@/lib/format';
import { epley, fmtNum, fmtWeight, safeSummary } from './safeEngine';
import { describeSets, isTime, volumeText } from './setFormat';

/** Prior (earlier) non-deleted sets for the given exercise ids, excluding one session. */
export async function priorSetsByExercise(exerciseIds: string[], session: WorkoutSession): Promise<Map<string, SetEntry[]>> {
  const map = new Map<string, SetEntry[]>();
  for (const id of exerciseIds) {
    const rows = (await db.sets.where('exerciseId').equals(id).toArray()).filter(
      (r) => !r._deleted && r.sessionId !== session.id && r.completedAt < session.startedAt,
    );
    map.set(id, rows.map((r) => strip(r)));
  }
  return map;
}

/** Working sets from the most recent earlier session in `prior` (one exercise's history). */
export function lastTimeSets(prior: SetEntry[]): SetEntry[] {
  const work = prior.filter((s) => s.type !== 'warmup');
  if (!work.length) return [];
  const latest = work.reduce((a, b) => (b.completedAt > a.completedAt ? b : a));
  return work.filter((s) => s.sessionId === latest.sessionId).sort((a, b) => a.order - b.order);
}

/** 1 = better than last time (heavier top set, or same top weight with more reps), 0 = same, -1 = less. */
export function compareToLast(now: SetEntry[], before: SetEntry[]): -1 | 0 | 1 {
  const top = (list: SetEntry[]) => Math.max(...list.map((s) => s.weight));
  const reps = (list: SetEntry[], w: number) => list.filter((s) => s.weight === w).reduce((n, s) => n + s.reps, 0);
  const a = top(now);
  const b = top(before);
  if (a !== b) return a > b ? 1 : -1;
  const ra = reps(now, a);
  const rb = reps(before, b);
  return ra === rb ? 0 : ra > rb ? 1 : -1;
}

export interface RecordLine {
  exerciseId: string;
  text: string;
  /** Improvement over the previous best estimated 1RM, e.g. 0.04 = 4 %. */
  gain: number;
}

/** Records worth celebrating: a better estimated 1RM than ever before, the three biggest gains. */
export const MAX_RECORDS = 3;

/** Swedish record lines for a session, e.g. "Bänkpress: 1RM 85 kg (+4 %)", biggest gain first. */
export function recordLines(
  session: WorkoutSession,
  sets: SetEntry[],
  prior: Map<string, SetEntry[]>,
  exMap: Map<string, Exercise>,
  unit: Unit,
): RecordLine[] {
  const lines: RecordLine[] = [];
  const ids = [...new Set(session.exercises.map((e) => e.exerciseId))];
  const best = (list: SetEntry[]) => Math.max(0, ...list.filter((s) => s.type !== 'warmup' && s.reps > 0).map((s) => epley(s.weight, s.reps)));
  for (const id of ids) {
    const ex = exMap.get(id);
    if (isTime(ex)) continue;
    const now = best(sets.filter((s) => s.exerciseId === id));
    const before = best(prior.get(id) ?? []);
    // Needs history to beat, and a real step up (rounding noise is not a record).
    if (before <= 0 || now <= before * 1.005) continue;
    const gain = now / before - 1;
    lines.push({
      exerciseId: id,
      gain,
      text: `${ex?.name ?? 'Övning'}: uppskattat 1RM ${fmtWeight(Math.round(now * 10) / 10, unit)} (+${Math.round(gain * 100)} %)`,
    });
  }
  return lines.sort((a, b) => b.gain - a.gain).slice(0, MAX_RECORDS);
}

export default function SummaryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useSession(id);
  const sets = useSessionSets(id);
  const exMap = useExerciseMap();
  const settings = useSettings();
  const prior = useLiveQuery(
    async () => (session ? priorSetsByExercise([...new Set(session.exercises.map((e) => e.exerciseId))], session) : null),
    [session],
  );
  // The last time this same pass (template) was done, for the volume comparison.
  const previous = useLiveQuery(async () => {
    if (!session?.templateId) return null;
    const rows = (await db.sessions.where('status').equals('completed').toArray()).filter(
      (r) => !r._deleted && r.templateId === session.templateId && r.id !== session.id && r.startedAt < session.startedAt,
    );
    const prev = rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!prev) return null;
    return safeSummary(strip(prev), await getSessionSets(prev.id)).volumeKg;
  }, [session]);
  const programs = usePrograms();
  const templates = useTemplates();
  const completed = useCompletedSessions();

  if (session === undefined || !sets || !exMap) return <div className="p-6 text-center text-muted">Laddar…</div>;
  if (!session)
    return (
      <Page title="Sammanfattning" back="/">
        <EmptyState title="Passet hittades inte" />
      </Page>
    );

  const unit = settings.unit;
  const summary = safeSummary(session, sets);
  const records = prior ? recordLines(session, sets, prior, exMap, unit) : [];
  const lastTime = new Map([...(prior ?? new Map<string, SetEntry[]>())].map(([id, list]) => [id, lastTimeSets(list)]));
  const volumeDelta = previous != null && previous > 0 ? summary.volumeKg - previous : null;
  const program = programs?.find((p) => p.id === settings.activeProgramId);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = program && completed ? safeUpcoming(program, completed, tomorrow) : null;

  return (
    <Page title="Bra jobbat!">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{session.name}</h2>
          <p className="text-muted">{formatLongDate(session.startedAt)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Tid" value={formatSessionLength(summary.durationSec)} />
          <Stat label="Set" value={String(summary.setCount)} />
          <Stat label="Volym" value={volumeText(summary.volumeKg, unit)} />
        </div>
        {volumeDelta != null && volumeDelta !== 0 && (
          <p className={cx('rounded-xl px-3 py-2 text-sm font-semibold', volumeDelta > 0 ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-muted')}>
            {volumeDelta > 0 ? '↑' : '↓'} {volumeText(Math.abs(volumeDelta), unit)} {volumeDelta > 0 ? 'mer' : 'mindre'} volym än förra gången du körde {session.name}
          </p>
        )}

        {records.length > 0 && (
          <Card>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <Trophy aria-hidden size={20} className="text-warn" /> {records.length === 1 ? 'Nytt rekord' : 'Nya rekord'}
            </h3>
            <ul className="space-y-1">
              {records.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
          </Card>
        )}

        {session.notes && (
          <Card>
            <h3 className="mb-1 text-sm text-muted">Anteckning</h3>
            <p className="whitespace-pre-wrap">{session.notes}</p>
          </Card>
        )}

        <ExerciseSetList session={session} sets={sets} exMap={exMap} unit={unit} lastTime={lastTime} />

        {next && (
          <Card className="flex items-center gap-3">
            <CalendarDays aria-hidden size={20} className="shrink-0 text-accent" />
            <span>
              <span className="block text-sm text-muted">Nästa pass</span>
              <span className="font-semibold first-letter:uppercase">
                {formatDate(next.date)} – {templates?.find((t) => t.id === next.templateId)?.name ?? 'Okänt pass'}
              </span>
            </span>
          </Card>
        )}
        {/* Keeps the last card clear of the fixed button. */}
        <div aria-hidden className="h-20" />

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-xl">
            <Button variant="primary" size="xl" className="w-full" onClick={() => navigate('/')}>
              Klar
            </Button>
          </div>
        </div>
      </div>
    </Page>
  );
}

function LastTimeLine({ now, before, ex, unit }: { now: SetEntry[]; before: SetEntry[]; ex: Exercise | undefined; unit: Unit }) {
  const c = compareToLast(now, before);
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted">
      <span aria-hidden className={cx('font-bold', c > 0 ? 'text-accent' : c < 0 ? 'text-warn' : 'text-muted')}>
        {c > 0 ? '↑' : c < 0 ? '↓' : '='}
      </span>
      <span>
        Förra gången: <span className="tabular">{describeSets(before, ex, unit)}</span>
      </span>
      <span className="sr-only">{c > 0 ? 'Bättre än förra gången' : c < 0 ? 'Mindre än förra gången' : 'Samma som förra gången'}</span>
    </div>
  );
}

function safeUpcoming(program: Program, completed: WorkoutSession[], from: Date): { date: Date; templateId: string } | null {
  try {
    return upcomingSchedule(program, completed, from, 1)[0] ?? null;
  } catch {
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular text-xl font-bold">{value}</div>
    </div>
  );
}

/** Read-only list of exercises with their logged sets. */
export function ExerciseSetList({
  session,
  sets,
  exMap,
  unit,
  lastTime,
}: {
  session: WorkoutSession;
  sets: SetEntry[];
  exMap: Map<string, Exercise>;
  unit: Unit;
  /** Working sets from the previous time per exercise id; adds a "Förra gången" line. */
  lastTime?: Map<string, SetEntry[]>;
}) {
  const withSets = session.exercises.filter((se) => sets.some((s) => s.sessionExerciseId === se.id));
  if (!withSets.length) return <EmptyState title="Inga set loggade" />;
  return (
    <ul className="space-y-2">
      {withSets.map((se) => {
        const ex = exMap.get(se.exerciseId);
        const own = sets.filter((s) => s.sessionExerciseId === se.id);
        const warm = own.filter((s) => s.type === 'warmup');
        const work = own.filter((s) => s.type !== 'warmup');
        return (
          <li key={se.id}>
            <Card>
              <div className="font-semibold">{ex?.name ?? 'Okänd övning'}</div>
              {work.length > 0 && <div className="tabular">{describeSets(work, ex, unit)}</div>}
              {work.length > 0 && !!lastTime?.get(se.exerciseId)?.length && !isTime(ex) && (
                <LastTimeLine now={work} before={lastTime.get(se.exerciseId)!} ex={ex} unit={unit} />
              )}
              {warm.length > 0 && <div className="text-sm text-muted">Uppvärmning: {describeSets(warm, ex, unit)}</div>}
              {own.some((s) => s.rpe != null) && (
                <div className="text-sm text-muted">
                  RPE: {own.filter((s) => s.rpe != null).map((s) => fmtNum(s.rpe!, 1)).join(' / ')}
                </div>
              )}
              {se.notes && <div className="mt-1 text-sm text-muted"><NotebookPen aria-hidden size={14} className="mr-1 inline-block align-[-2px]" />{se.notes}</div>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
