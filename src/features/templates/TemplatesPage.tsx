import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateMinutes } from '@/engine';
import { useActiveSession, useCompletedSessions, useExerciseMap, usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { formatDate } from '@/lib/format';
import { Button, Card, EmptyState, Page } from '@/ui';
import { safe } from '@/features/library/safe';
import { startSession } from '@/features/workout/start';

const headerLink = 'inline-flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold active:bg-surface-2';

export default function TemplatesPage() {
  const templates = useTemplates();
  const exMap = useExerciseMap();
  const programs = usePrograms();
  const settings = useSettings();
  const active = useActiveSession();
  const completed = useCompletedSessions();
  // Last time each template was run (completed is newest first); used ones are listed first.
  const lastRun = new Map<string, string>();
  for (const c of completed ?? []) if (c.templateId && !lastRun.has(c.templateId)) lastRun.set(c.templateId, c.startedAt);
  const ordered = templates && [...templates].sort((a, b) => (lastRun.get(b.id) ?? '').localeCompare(lastRun.get(a.id) ?? '') || a.name.localeCompare(b.name, 'sv'));
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeProgram = programs?.find((p) => p.id === settings.activeProgramId);

  async function start(templateId: string | null) {
    if (active) {
      if (!window.confirm(`Du har redan ett pågående pass (${active.name}). Gå till det i stället?`)) return;
      navigate('/workout');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startSession({ templateId, programId: null });
      navigate('/workout');
    } catch (e) {
      console.error(e);
      setError('Kunde inte starta passet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Mina pass"
      actions={
        <>
          <Link to="/programs" className={headerLink}>
            Schema
          </Link>
          <Link to="/exercises" className={headerLink}>
            Övningar
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-bad/20 p-3 text-bad">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" className="w-full" onClick={() => navigate('/skapa/pass')}>
          + Skapa gympass
        </Button>

        <Link to="/programs" className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 active:bg-surface-2">
          <span>
            <span className="block text-sm text-muted">Aktivt schema</span>
            <span className="block font-semibold">{activeProgram?.name ?? 'Inget valt'}</span>
          </span>
          <span aria-hidden className="text-muted">
            ›
          </span>
        </Link>

        <section aria-labelledby="tpl-heading" className="space-y-3">
          <h2 id="tpl-heading" className="text-lg font-bold">
            Sparade pass
          </h2>
          {templates === undefined && <p className="text-muted">Laddar…</p>}
          {templates?.length === 0 && (
            <EmptyState title="Inga pass ännu">Tryck på Skapa gympass för att bygga ditt första.</EmptyState>
          )}
          <ul className="space-y-3">
            {ordered?.map((t) => {
              const minutes = safe(() => estimateMinutes(t), 0);
              const names = t.exercises
                .map((e) => exMap?.get(e.exerciseId)?.name)
                .filter(Boolean)
                .slice(0, 4)
                .join(', ');
              return (
                <li key={t.id}>
                  <Card className="flex items-center gap-3 p-3">
                    <Link to={`/templates/${t.id}`} className="min-h-12 min-w-0 flex-1 rounded-xl active:bg-surface-2">
                      <span className="block truncate font-semibold">{t.name || 'Namnlöst pass'}</span>
                      <span className="block text-sm text-muted">
                        {t.exercises.length} övningar{minutes ? ` · ca ${minutes} min` : ''}
                        {lastRun.has(t.id) && ` · senast ${formatDate(lastRun.get(t.id)!)}`}
                      </span>
                      {names && <span className="block truncate text-xs text-muted">{names}</span>}
                    </Link>
                    <Button
                      variant="good"
                      disabled={busy || t.exercises.length === 0}
                      aria-label={`Starta ${t.name || 'pass'}`}
                      onClick={() => void start(t.id)}
                    >
                      Starta
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Page>
  );
}
