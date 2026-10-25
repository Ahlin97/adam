import { Link, useNavigate } from 'react-router-dom';
import type { Program, WorkoutTemplate } from '@/engine';
import { usePrograms, useSettings, useTemplates } from '@/db/hooks';
import { saveSettings } from '@/db/repo';
import { WEEKDAY_SHORT } from '@/lib/labels';
import { Button, Card, EmptyState, Page, cx } from '@/ui';
import { CalendarDays, ChevronRight } from 'lucide-react';

export function programSummary(p: Program, templates: Map<string, WorkoutTemplate>): string {
  const name = (id: string) => templates.get(id)?.name ?? '?';
  if (p.mode === 'rotation') {
    if (!p.rotation.length) return 'Rotation – inga pass';
    return `Rotation: ${p.rotation.map(name).join(' → ')}`;
  }
  const days = p.weekdays.map((t, i) => (t ? `${WEEKDAY_SHORT[i]} ${name(t)}` : null)).filter(Boolean);
  return days.length ? days.join(', ') : 'Veckodagar – inga pass';
}

export default function ProgramsPage() {
  const programs = usePrograms();
  const templates = useTemplates();
  const settings = useSettings();
  const navigate = useNavigate();
  const tplMap = new Map((templates ?? []).map((t) => [t.id, t]));
  // Active program first, then by name.
  const isActiveId = (id: string) => Number(id === settings.activeProgramId);
  const sorted = programs && [...programs].sort((a, b) => isActiveId(b.id) - isActiveId(a.id) || a.name.localeCompare(b.name, 'sv'));

  return (
    <Page
      title="Program"
      back="/templates"
      actions={
        <Button onClick={() => navigate('/programs/new')}>+ Eget program</Button>
      }
    >
      <Link to="/programs/plan" className="card-hero press mb-4 flex min-h-20 items-center gap-4 p-4 active:opacity-90">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <CalendarDays size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">Planera veckan</span>
          <span className="block text-sm text-muted">Välj dagar och upplägg – klart på en minut.</span>
        </span>
        <ChevronRight aria-hidden size={22} className="text-muted" />
      </Link>
      <p className="mb-4 text-sm text-muted">Det aktiva programmet styr vilket pass som visas som dagens pass på startsidan.</p>
      {sorted === undefined && <p className="text-muted">Laddar…</p>}
      {sorted?.length === 0 && <EmptyState title="Inga program ännu">Skapa ett program med veckodagar eller rotation.</EmptyState>}
      <ul className="space-y-3">
        {sorted?.map((p) => {
          const isActive = p.id === settings.activeProgramId;
          return (
            <li key={p.id}>
              <Card className={cx('space-y-3 p-3', isActive && 'border-accent')}>
                <Link to={`/programs/${p.id}`} className="block min-h-12 rounded-xl active:bg-surface-2">
                  <span className="flex items-center gap-2 font-semibold">
                    {p.name || 'Namnlöst program'}
                    {isActive && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">Aktivt</span>}
                  </span>
                  <span className="block text-sm text-muted">{programSummary(p, tplMap)}</span>
                </Link>
                <div className="flex gap-2">
                  {isActive ? (
                    <Button size="sm" className="flex-1" onClick={() => void saveSettings({ activeProgramId: null })}>
                      Avaktivera
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      aria-label={`Aktivera ${p.name}`}
                      onClick={() => void saveSettings({ activeProgramId: p.id })}
                    >
                      Aktivera
                    </Button>
                  )}
                  <Button size="sm" className="flex-1" onClick={() => navigate(`/programs/${p.id}`)}>
                    Redigera
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
