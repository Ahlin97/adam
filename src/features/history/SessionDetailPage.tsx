// View and edit a completed session afterwards.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SessionExercise, SetEntry } from '@/engine';
import { useExerciseMap, useSession, useSessionSets, useSettings } from '@/db/hooks';
import { putMany } from '@/db/repo';
import { Button, Card, EmptyState, Field, Page, Sheet, cx, inputClass } from '@/ui';
import { formatLongDate, formatSessionLength } from '@/lib/format';
import { fmtNum, safeSummary } from '@/features/workout/safeEngine';
import { setText, volumeText } from '@/features/workout/setFormat';
import { SetEditSheet, type SetValues } from '@/features/workout/SetEditSheet';
import { deleteSession, deleteSet, logSet, startSession, updateSession, updateSet } from '@/features/workout/start';
import { NotebookPen, Pencil, RotateCcw } from 'lucide-react';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Editing = { kind: 'edit'; set: SetEntry } | { kind: 'add'; se: SessionExercise } | null;

export default function SessionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useSession(id);
  const sets = useSessionSets(id);
  const exMap = useExerciseMap();
  const settings = useSettings();
  const [editing, setEditing] = useState<Editing>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [starting, setStarting] = useState(false);

  if (session === undefined || !sets || !exMap) return <div className="p-6 text-center text-muted">Laddar…</div>;
  if (!session)
    return (
      <Page title="Pass" back="/history">
        <EmptyState title="Passet hittades inte">Det kan ha raderats.</EmptyState>
      </Page>
    );

  const unit = settings.unit;
  const sum = safeSummary(session, sets);

  const editEx =
    editing?.kind === 'edit' ? exMap.get(editing.set.exerciseId) : editing?.kind === 'add' ? exMap.get(editing.se.exerciseId) : undefined;
  let initial: SetValues = { type: 'working', reps: 8, weight: 0, durationSec: null, rpe: null };
  if (editing?.kind === 'edit') {
    const s = editing.set;
    initial = { type: s.type, reps: s.reps, weight: s.weight, durationSec: s.durationSec, rpe: s.rpe };
  } else if (editing?.kind === 'add') {
    const last = sets.filter((s) => s.sessionExerciseId === editing.se.id).at(-1);
    initial = last
      ? { type: last.type === 'warmup' ? 'working' : last.type, reps: last.reps, weight: last.weight, durationSec: last.durationSec, rpe: null }
      : { type: 'working', reps: editing.se.repMin, weight: 0, durationSec: editEx?.measure === 'time' ? editing.se.repMin : null, rpe: null };
  }

  return (
    <Page
      title={session.name}
      back="/history"
      actions={
        <Button variant="ghost" size="sm" onClick={() => setMetaOpen(true)}>
          Redigera
        </Button>
      }
    >
      <div className="space-y-4">
        {session.status === 'active' && (
          <Button variant="good" size="lg" className="w-full" onClick={() => navigate('/workout')}>
            Passet pågår – fortsätt logga
          </Button>
        )}
        <div>
          <p className="text-muted">{formatLongDate(session.startedAt)}</p>
          <p className="tabular mt-1">
            {formatSessionLength(sum.durationSec)} · {sum.setCount} set · {volumeText(sum.volumeKg, unit)}
          </p>
        </div>
        {session.status === 'completed' && session.exercises.length > 0 && (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try {
                await startSession({ templateId: null, programId: session.programId, repeatSessionId: session.id });
                navigate('/workout');
              } finally {
                setStarting(false);
              }
            }}
          >
            <RotateCcw aria-hidden size={18} /> Kör igen
          </Button>
        )}

        {session.notes && (
          <Card>
            <h2 className="mb-1 text-sm text-muted">Anteckning</h2>
            <p className="whitespace-pre-wrap">{session.notes}</p>
          </Card>
        )}

        {session.exercises.length === 0 && <EmptyState title="Inga övningar" />}

        <ul className="space-y-3">
          {session.exercises.map((se) => {
            const ex = exMap.get(se.exerciseId);
            const own = sets.filter((s) => s.sessionExerciseId === se.id);
            return (
              <li key={se.id}>
                <Card className="p-3">
                  <h2 className="px-1 font-semibold">{ex?.name ?? 'Okänd övning'}</h2>
                  {se.notes && <p className="px-1 text-sm text-muted"><NotebookPen aria-hidden size={14} className="mr-1 inline-block align-[-2px]" />{se.notes}</p>}
                  <ol className="mt-2 space-y-1">
                    {own.map((s, i) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left active:bg-surface-2"
                          onClick={() => setEditing({ kind: 'edit', set: s })}
                          aria-label={`Set ${i + 1}: ${setText(s, ex, unit)}. Tryck för att ändra`}
                        >
                          <span className="w-6 text-center text-sm text-muted">{i + 1}</span>
                          <span className="tabular flex-1">{setText(s, ex, unit)}</span>
                          {s.rpe != null && <span className="text-sm text-muted">RPE {fmtNum(s.rpe, 1)}</span>}
                          {s.type !== 'working' && (
                            <span
                              className={cx(
                                'rounded-full px-2 text-xs font-semibold',
                                s.type === 'warmup' ? 'bg-warn/20 text-warn' : s.type === 'failure' ? 'bg-bad/20 text-bad' : 'bg-surface-2',
                              )}
                            >
                              {s.type === 'warmup' ? 'Uppv.' : s.type === 'drop' ? 'Drop' : 'Failure'}
                            </span>
                          )}
                          <Pencil aria-hidden size={14} className="text-muted" />
                        </button>
                      </li>
                    ))}
                  </ol>
                  <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setEditing({ kind: 'add', se })}>
                    + Lägg till set
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>

        {confirmDelete ? (
          <Card className="space-y-3 border-bad/60">
            <p>Radera passet och alla dess set? Det går inte att ångra.</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setConfirmDelete(false)}>
                Avbryt
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  await deleteSession(session.id);
                  navigate('/history', { replace: true });
                }}
              >
                Ja, radera
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmDelete(true)}>
            Radera pass
          </Button>
        )}
      </div>

      <SetEditSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'add' ? `Nytt set – ${editEx?.name ?? ''}` : `Ändra set – ${editEx?.name ?? ''}`}
        initial={initial}
        exercise={editEx}
        settings={settings}
        onSave={async (v) => {
          if (editing?.kind === 'edit') {
            await updateSet({ ...editing.set, ...v });
          } else if (editing?.kind === 'add') {
            const last = sets.filter((s) => s.sessionExerciseId === editing.se.id).at(-1);
            await logSet({
              sessionId: session.id,
              sessionExerciseId: editing.se.id,
              exerciseId: editing.se.exerciseId,
              ...v,
              completedAt: last?.completedAt ?? session.endedAt ?? session.startedAt,
            });
          }
        }}
        onDelete={editing?.kind === 'edit' ? () => deleteSet(editing.set.id) : undefined}
      />

      <Sheet open={metaOpen} onClose={() => setMetaOpen(false)} title="Redigera pass">
        {metaOpen && <MetaEditor sessionId={session.id} name={session.name} notes={session.notes} startedAt={session.startedAt} endedAt={session.endedAt} sets={sets} onDone={() => setMetaOpen(false)} />}
      </Sheet>
    </Page>
  );
}

function MetaEditor({
  sessionId,
  name: initialName,
  notes: initialNotes,
  startedAt,
  endedAt,
  sets,
  onDone,
}: {
  sessionId: string;
  name: string;
  notes: string;
  startedAt: string;
  endedAt: string | null;
  sets: SetEntry[];
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [start, setStart] = useState(toLocalInput(startedAt));
  const durationMin = endedAt ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000) : null;
  const [minutes, setMinutes] = useState(durationMin != null ? String(durationMin) : '');

  const save = async () => {
    const newStart = new Date(start);
    const valid = !Number.isNaN(newStart.getTime());
    const delta = valid ? newStart.getTime() - new Date(startedAt).getTime() : 0;
    const mins = parseInt(minutes, 10);
    const newStartIso = valid ? newStart.toISOString() : startedAt;
    const newEnd = Number.isFinite(mins) && mins >= 0
      ? new Date(new Date(newStartIso).getTime() + mins * 60000).toISOString()
      : endedAt && new Date(new Date(endedAt).getTime() + delta).toISOString();
    await updateSession(sessionId, { name: name.trim() || initialName, notes, startedAt: newStartIso, endedAt: newEnd ?? null });
    if (delta !== 0 && sets.length) {
      await putMany(
        'sets',
        sets.map((s) => ({ ...s, completedAt: new Date(new Date(s.completedAt).getTime() + delta).toISOString() })),
      );
    }
    onDone();
  };

  return (
    <div className="space-y-4">
      <Field label="Namn">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Startade">
        <input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Längd (minuter)">
        <input inputMode="numeric" className={inputClass} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Field label="Anteckning">
        <textarea className={cx(inputClass, 'min-h-24 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
        Spara
      </Button>
    </div>
  );
}
