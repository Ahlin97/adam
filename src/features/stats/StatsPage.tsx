import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAllSets, useCompletedSessions, useExerciseMap } from '@/db/hooks';
import { MUSCLE_LABELS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Button, Card, EmptyState, ListLink, Page } from '@/ui';
import { addWeeks, muscleSetsForWeek, sessionsPerWeek, startOfWeek, trainedExercises, weekLabel } from './aggregate';
import { CHART, axisTick, tooltipProps } from './chartTheme';
import { fmtNum } from './units';

const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' });

export default function StatsPage() {
  const sessions = useCompletedSessions();
  const sets = useAllSets();
  const exMap = useExerciseMap();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showTable, setShowTable] = useState(false);

  const now = useMemo(() => new Date(), []);
  const perWeek = useMemo(() => (sessions ? sessionsPerWeek(sessions, 12, now) : []), [sessions, now]);
  const selectedWeek = useMemo(() => addWeeks(startOfWeek(now), -weekOffset), [now, weekOffset]);
  const muscles = useMemo(
    () => (sets && sessions && exMap ? muscleSetsForWeek(sets, sessions, exMap, selectedWeek) : []),
    [sets, sessions, exMap, selectedWeek],
  );
  const trained = useMemo(() => (sets && sessions ? trainedExercises(sets, sessions) : []), [sets, sessions]);

  if (!sessions || !sets || !exMap) return <Page title="Statistik">{null}</Page>;

  if (!sessions.length)
    return (
      <Page title="Statistik">
        <EmptyState title="Ingen statistik än">Avsluta ditt första pass så dyker grafer och personbästan upp här.</EmptyState>
      </Page>
    );

  const total12 = perWeek.reduce((s, w) => s + w.count, 0);
  const maxMuscle = Math.max(1, ...muscles.map((m) => m.sets));
  const weekEnd = new Date(selectedWeek.getFullYear(), selectedWeek.getMonth(), selectedWeek.getDate() + 6);

  return (
    <Page title="Statistik" className="space-y-6">
      <section aria-labelledby="spw-h">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="spw-h" className="font-bold">Pass per vecka</h2>
              <p className="text-sm text-muted">
                Senaste 12 veckorna: {total12} pass, snitt {fmtNum(total12 / 12)} per vecka
              </p>
            </div>
            <Button size="sm" variant="ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Visa graf' : 'Visa tabell'}
            </Button>
          </div>
          {showTable ? (
            <table className="mt-3 w-full text-sm tabular">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Vecka</th>
                  <th className="py-1 text-right font-medium">Pass</th>
                </tr>
              </thead>
              <tbody>
                {[...perWeek].reverse().map((w) => (
                  <tr key={w.key} className="border-t border-border">
                    <td className="py-1.5">{w.label}</td>
                    <td className="py-1.5 text-right">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-3 h-48" role="img" aria-label={`Stapeldiagram, pass per vecka: ${perWeek.map((w) => `${w.label} ${w.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perWeek} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" tickFormatter={(l: string) => l.replace('v. ', '')} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={48} />
                  <Tooltip {...tooltipProps} formatter={(v) => [`${v} pass`, '']} separator="" />
                  <Bar dataKey="count" fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="msw-h">
        <Card>
          <h2 id="msw-h" className="font-bold">Arbetsset per muskelgrupp</h2>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button size="sm" aria-label="Föregående vecka" onClick={() => setWeekOffset((o) => o + 1)}>‹</Button>
            <div className="text-center" aria-live="polite">
              <div className="font-semibold">{weekLabel(selectedWeek)}{weekOffset === 0 && ' (denna vecka)'}</div>
              <div className="text-xs text-muted">{dayMonth.format(selectedWeek)} – {dayMonth.format(weekEnd)}</div>
            </div>
            <Button size="sm" aria-label="Nästa vecka" disabled={weekOffset === 0} onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}>›</Button>
          </div>
          {muscles.length ? (
            <ul className="mt-3 space-y-2">
              {muscles.map((m) => (
                <li key={m.muscle} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="truncate">{MUSCLE_LABELS[m.muscle]}</span>
                  <span className="h-3 rounded bg-surface-2" aria-hidden>
                    <span className="block h-3 rounded bg-accent" style={{ width: `${(m.sets / maxMuscle) * 100}%` }} />
                  </span>
                  <span className="text-right tabular font-semibold">{fmtNum(m.sets)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Inga arbetsset den här veckan.</p>
          )}
          <p className="mt-3 text-xs text-muted">Primär muskel räknas som 1 set, sekundära muskler som 0,5 set. Uppvärmning räknas inte.</p>
        </Card>
      </section>

      <section aria-labelledby="ex-h">
        <h2 id="ex-h" className="mb-2 font-bold">Övningar</h2>
        {trained.length ? (
          <Card className="p-1">
            <ul>
              {trained.map((t) => (
                <li key={t.exerciseId}>
                  <ListLink to={`/stats/exercise/${t.exerciseId}`} right={<span className="text-sm text-muted">{t.sessionCount} pass</span>}>
                    <div className="truncate font-medium">{exMap.get(t.exerciseId)?.name ?? 'Okänd övning'}</div>
                    <div className="text-xs text-muted">Senast {formatDate(t.lastDate)}</div>
                  </ListLink>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Inga loggade övningar" />
        )}
      </section>
    </Page>
  );
}
