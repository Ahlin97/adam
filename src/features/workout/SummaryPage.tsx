// Post-session summary: duration, sets, volume, personal records and the logged exercises.
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, SetEntry, Unit, WorkoutSession } from '@/engine';
import { db } from '@/db/db';
import { strip } from '@/db/repo';
import { useExerciseMap, useSession, useSessionSets, useSettings } from '@/db/hooks';
import { Button, Card, EmptyState, Page } from '@/ui';
import { formatLongDate, formatSessionLength } from '@/lib/format';
import { epley, fmtNum, fmtWeight, safeNewRecords, safeSummary } from './safeEngine';
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

export interface RecordLine {
  exerciseId: string;
  text: string;
}

/** Swedish PR lines for a session, e.g. "Bänkpress: ny tyngsta vikt 100 kg". */
export function recordLines(
  session: WorkoutSession,
  sets: SetEntry[],
  prior: Map<string, SetEntry[]>,
  exMap: Map<string, Exercise>,
  unit: Unit,
): RecordLine[] {
  const lines: RecordLine[] = [];
  const ids = [...new Set(session.exercises.map((e) => e.exerciseId))];
  for (const id of ids) {
    const ex = exMap.get(id);
    if (isTime(ex)) continue;
    const current = sets.filter((s) => s.exerciseId === id && s.type !== 'warmup' && s.reps > 0);
    const before = prior.get(id) ?? [];
    if (!current.length || !before.length) continue;
    const r = safeNewRecords(before, current);
    const name = ex?.name ?? 'Övning';
    if (r.heaviest) {
      const w = Math.max(...current.map((s) => s.weight));
      lines.push({ exerciseId: id, text: `${name}: ny tyngsta vikt ${fmtWeight(w, unit)}` });
    }
    if (r.best1RM) {
      const best = Math.max(...current.map((s) => epley(s.weight, s.reps)));
      lines.push({ exerciseId: id, text: `${name}: nytt uppskattat 1RM ${fmtWeight(Math.round(best * 10) / 10, unit)}` });
    }
    for (const w of r.repsAtWeight) {
      const reps = Math.max(...current.filter((s) => s.weight === w).map((s) => s.reps));
      lines.push({ exerciseId: id, text: `${name}: flest reps på ${fmtWeight(w, unit)} (${reps})` });
    }
  }
  return lines;
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

        {records.length > 0 && (
          <Card className="border-good/60">
            <h3 className="mb-2 text-lg font-bold text-good">🏆 Nya personbästan</h3>
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

        <ExerciseSetList session={session} sets={sets} exMap={exMap} unit={unit} />

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
}: {
  session: WorkoutSession;
  sets: SetEntry[];
  exMap: Map<string, Exercise>;
  unit: Unit;
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
              {warm.length > 0 && <div className="text-sm text-muted">Uppvärmning: {describeSets(warm, ex, unit)}</div>}
              {own.some((s) => s.rpe != null) && (
                <div className="text-sm text-muted">
                  RPE: {own.filter((s) => s.rpe != null).map((s) => fmtNum(s.rpe!, 1)).join(' / ')}
                </div>
              )}
              {se.notes && <div className="mt-1 text-sm text-muted">📝 {se.notes}</div>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
