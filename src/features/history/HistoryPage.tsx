// History: list of completed sessions or a month calendar with training days.
import { useMemo, useState } from 'react';
import type { SetEntry, Unit, WorkoutSession } from '@/engine';
import { useAllSets, useCompletedSessions, useSettings } from '@/db/hooks';
import { Chip, EmptyState, ListLink, Page, cx } from '@/ui';
import { dayKey, formatDate, formatSessionLength, formatTime } from '@/lib/format';
import { safeSummary } from '@/features/workout/safeEngine';
import { volumeText } from '@/features/workout/setFormat';
import { startOfWeek, weekLabel } from '@/features/stats/aggregate';

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const VIEW_KEY = 'history.view';

function readView(): 'list' | 'calendar' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list';
  } catch {
    return 'list';
  }
}

export default function HistoryPage() {
  const sessions = useCompletedSessions();
  const allSets = useAllSets();
  const settings = useSettings();
  const [view, setView] = useState<'list' | 'calendar'>(readView);

  const setsBySession = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of allSets ?? []) {
      const l = m.get(s.sessionId);
      if (l) l.push(s);
      else m.set(s.sessionId, [s]);
    }
    return m;
  }, [allSets]);

  const changeView = (v: 'list' | 'calendar') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  return (
    <Page title="Historik">
      <div className="mb-4 flex gap-2" role="group" aria-label="Visa som">
        <Chip active={view === 'list'} onClick={() => changeView('list')}>
          Lista
        </Chip>
        <Chip active={view === 'calendar'} onClick={() => changeView('calendar')}>
          Kalender
        </Chip>
      </div>
      {!sessions ? (
        <p className="text-muted">Laddar…</p>
      ) : sessions.length === 0 ? (
        <EmptyState title="Inga genomförda pass ännu">Avslutade pass dyker upp här.</EmptyState>
      ) : view === 'list' ? (
        <WeekGroups sessions={sessions} setsBySession={setsBySession} unit={settings.unit} />
      ) : (
        <CalendarView sessions={sessions} setsBySession={setsBySession} unit={settings.unit} />
      )}
    </Page>
  );
}

/** Sessions per week (newest first), each week headed by its totals. */
export function groupByWeek(sessions: WorkoutSession[], now = new Date()): { weekStart: Date; title: string; sessions: WorkoutSession[] }[] {
  const thisWeek = startOfWeek(now).getTime();
  const groups = new Map<number, WorkoutSession[]>();
  for (const s of sessions) {
    const k = startOfWeek(s.startedAt).getTime();
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([k, list]) => {
      const weekStart = new Date(k);
      const weeksAgo = Math.round((thisWeek - k) / (7 * 864e5));
      const title = weeksAgo === 0 ? 'Den här veckan' : weeksAgo === 1 ? 'Förra veckan' : weekLabel(weekStart);
      return { weekStart, title, sessions: list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)) };
    });
}

function WeekGroups({ sessions, setsBySession, unit }: { sessions: WorkoutSession[]; setsBySession: Map<string, SetEntry[]>; unit: Unit }) {
  return (
    <div className="space-y-6">
      {groupByWeek(sessions).map((g) => {
        const sums = g.sessions.map((s) => safeSummary(s, setsBySession.get(s.id) ?? []));
        const setCount = sums.reduce((n, x) => n + x.setCount, 0);
        const volume = sums.reduce((n, x) => n + x.volumeKg, 0);
        return (
          <section key={g.weekStart.getTime()} aria-label={g.title}>
            <h2 className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{g.title}</span>
              <span className="tabular text-sm text-muted">
                {g.sessions.length} pass · {setCount} set · {volumeText(volume, unit)}
              </span>
            </h2>
            <SessionList sessions={g.sessions} setsBySession={setsBySession} unit={unit} withDate />
          </section>
        );
      })}
    </div>
  );
}

function SessionList({
  sessions,
  setsBySession,
  unit,
  withDate,
}: {
  sessions: WorkoutSession[];
  setsBySession: Map<string, SetEntry[]>;
  unit: Unit;
  withDate?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {sessions.map((s) => {
        const sets = setsBySession.get(s.id) ?? [];
        const sum = safeSummary(s, sets);
        return (
          <li key={s.id}>
            <ListLink to={`/history/${s.id}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{s.name}</span>
                <span className="shrink-0 text-sm text-muted">{withDate ? formatDate(s.startedAt) : formatTime(s.startedAt)}</span>
              </div>
              <div className="tabular text-sm text-muted">
                {formatSessionLength(sum.durationSec)} · {sum.setCount} set · {volumeText(sum.volumeKg, unit)}
              </div>
            </ListLink>
          </li>
        );
      })}
    </ul>
  );
}

function CalendarView({
  sessions,
  setsBySession,
  unit,
}: {
  sessions: WorkoutSession[];
  setsBySession: Map<string, SetEntry[]>;
  unit: Unit;
}) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(dayKey(today));

  const byDay = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>();
    for (const s of sessions) {
      const k = dayKey(s.startedAt);
      const l = m.get(k);
      if (l) l.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [sessions]);

  const first = month;
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7) cells.push(null);

  const monthCount = sessions.filter((s) => {
    const d = new Date(s.startedAt);
    return d.getFullYear() === first.getFullYear() && d.getMonth() === first.getMonth();
  }).length;

  const shift = (delta: number) => setMonth(new Date(first.getFullYear(), first.getMonth() + delta, 1));
  const todayKey = dayKey(today);
  const daySessions = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="min-h-12 min-w-12 rounded-xl text-2xl active:bg-surface-2" aria-label="Föregående månad" onClick={() => shift(-1)}>
            ‹
          </button>
          <div className="text-center">
            <h2 className="text-lg font-bold capitalize" aria-live="polite">
              {MONTHS[first.getMonth()]} {first.getFullYear()}
            </h2>
            <div className="text-xs text-muted">{monthCount} pass</div>
          </div>
          <button type="button" className="min-h-12 min-w-12 rounded-xl text-2xl active:bg-surface-2" aria-label="Nästa månad" onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="Kalender">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-xs font-semibold text-muted" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = dayKey(d);
            const count = byDay.get(k)?.length ?? 0;
            const isSel = k === selected;
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}${count ? `, ${count} pass` : ''}`}
                onClick={() => setSelected(k)}
                className={cx(
                  'flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl text-base',
                  isSel ? 'bg-fg text-bg' : count ? 'bg-surface-2' : 'active:bg-surface-2',
                  k === todayKey && !isSel && 'ring-1 ring-accent',
                )}
              >
                <span className={cx('tabular', count > 0 && 'font-bold')}>{d.getDate()}</span>
                <span className="flex h-2 gap-0.5" aria-hidden>
                  {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                    <span key={j} className={cx('h-1.5 w-1.5 rounded-full', isSel ? 'bg-bg' : 'bg-fg/70')} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <section aria-live="polite">
          <h3 className="mb-2 font-semibold">{formatDate(selected + 'T12:00:00')}</h3>
          {daySessions.length ? (
            <SessionList sessions={daySessions} setsBySession={setsBySession} unit={unit} />
          ) : (
            <p className="text-sm text-muted">Inget pass den här dagen.</p>
          )}
        </section>
      )}
    </div>
  );
}
