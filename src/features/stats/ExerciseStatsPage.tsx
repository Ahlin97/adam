import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAllSets, useCompletedSessions, useExerciseMap, useSettings } from '@/db/hooks';
import type { Unit } from '@/engine';
import { SET_TYPE_LABELS } from '@/lib/labels';
import { formatDate, formatDuration } from '@/lib/format';
import { Button, Card, Chip, EmptyState, Page } from '@/ui';
import { exerciseRecords, exerciseSeries, type ExercisePoint } from './aggregate';
import { CHART, axisTick, tooltipProps } from './chartTheme';
import { fmtBig, fmtWeight, toUnit } from './units';

type MetricKey = 'heaviest' | 'best1RM' | 'volume' | 'totalReps' | 'longestSec';

interface Metric {
  key: MetricKey;
  label: string;
  /** Value in display units. */
  value: (p: ExercisePoint, unit: Unit) => number;
  format: (v: number, unit: Unit) => string;
}

const sv1 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const sv0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' });

const METRICS: Record<MetricKey, Metric> = {
  heaviest: { key: 'heaviest', label: 'Tyngsta vikt', value: (p, u) => toUnit(p.heaviest, u), format: (v, u) => `${sv1.format(v)} ${u}` },
  best1RM: { key: 'best1RM', label: 'Uppskattat 1RM', value: (p, u) => toUnit(p.best1RM, u), format: (v, u) => `${sv1.format(v)} ${u}` },
  volume: { key: 'volume', label: 'Volym', value: (p, u) => toUnit(p.volume, u), format: (v, u) => `${sv0.format(v)} ${u}` },
  totalReps: { key: 'totalReps', label: 'Totalt antal reps', value: (p) => p.totalReps, format: (v) => `${sv0.format(v)} reps` },
  longestSec: { key: 'longestSec', label: 'Längsta tid', value: (p) => p.longestSec, format: (v) => formatDuration(v) },
};

/** Compact tick: 1 234 → "1,2k" for large numbers, otherwise decimal comma. */
function tick(v: number): string {
  if (Math.abs(v) >= 10000) return `${sv1.format(v / 1000)}k`;
  return sv1.format(v);
}

export default function ExerciseStatsPage() {
  const { id = '' } = useParams();
  const exMap = useExerciseMap();
  const sets = useAllSets();
  const sessions = useCompletedSessions();
  const settings = useSettings();
  const unit = settings.unit;
  const [metricKey, setMetricKey] = useState<MetricKey | null>(null);
  const [showTable, setShowTable] = useState(false);

  const series = useMemo(() => (sets && sessions ? exerciseSeries(sets, sessions, id) : []), [sets, sessions, id]);
  const records = useMemo(() => exerciseRecords(series), [series]);

  const exercise = exMap?.get(id);
  const title = exercise?.name ?? 'Övning';
  if (!exMap || !sets || !sessions) return <Page title={title} back="/stats">{null}</Page>;

  const isTime = exercise?.measure === 'time';
  const hasWeight = series.some((p) => p.heaviest > 0);
  const available: MetricKey[] = isTime ? ['longestSec'] : hasWeight ? ['heaviest', 'best1RM', 'volume'] : ['totalReps'];
  const metric = METRICS[metricKey && available.includes(metricKey) ? metricKey : available[0]];
  const data = series.map((p) => ({ date: p.date, label: shortDate.format(new Date(p.date)), value: metric.value(p, unit) }));
  const recent = [...series].reverse().slice(0, 10);

  if (!series.length)
    return (
      <Page title={title} back="/stats">
        <EmptyState title="Ingen historik">Du har inte loggat {exercise?.name ?? 'övningen'} i något avslutat pass än.</EmptyState>
      </Page>
    );

  const first = data[0].value;
  const last = data[data.length - 1].value;
  const summary = `${metric.label}: från ${metric.format(first, unit)} (${formatDate(data[0].date)}) till ${metric.format(last, unit)} (${formatDate(data[data.length - 1].date)}), ${data.length} pass.`;

  return (
    <Page title={title} back="/stats" className="space-y-6">
      <section aria-labelledby="chart-h">
        <Card>
          <h2 id="chart-h" className="sr-only">Utveckling över tid</h2>
          {available.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Välj mått">
              {available.map((k) => (
                <Chip key={k} active={metric.key === k} onClick={() => setMetricKey(k)}>
                  {METRICS[k].label}
                </Chip>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-sm text-muted">{summary}</p>
            <Button size="sm" variant="ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Graf' : 'Tabell'}
            </Button>
          </div>
          {showTable ? (
            <table className="mt-3 w-full text-sm tabular">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Datum</th>
                  <th className="py-1 text-right font-medium">{metric.label}</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((d, i) => (
                  <tr key={`${d.date}-${i}`} className="border-t border-border">
                    <td className="py-1.5">{formatDate(d.date)}</td>
                    <td className="py-1.5 text-right">{metric.format(d.value, unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-3 h-56" role="img" aria-label={`Linjediagram. ${summary}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => (metric.key === 'longestSec' ? formatDuration(v) : tick(v))}
                  />
                  <Tooltip
                    {...tooltipProps}
                    labelFormatter={(_l, payload) => {
                      const d = payload?.[0]?.payload as { date?: string } | undefined;
                      return d?.date ? formatDate(d.date) : '';
                    }}
                    formatter={(v) => [metric.format(Number(v), unit), metric.label]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART.series}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={data.length <= 30 ? { r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 } : false}
                    activeDot={{ r: 6, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      {!isTime && (
        <section aria-labelledby="pr-h" className="space-y-3">
          <h2 id="pr-h" className="font-bold">Personbästan</h2>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <div className="text-sm text-muted">Tyngsta vikt</div>
              <div className="text-2xl font-bold tabular">{records.heaviest ? fmtWeight(records.heaviest.weight, unit) : '–'}</div>
              {records.heaviest && (
                <div className="text-xs text-muted">
                  {records.heaviest.reps} reps · {formatDate(records.heaviest.date)}
                </div>
              )}
            </Card>
            <Card>
              <div className="text-sm text-muted">Bästa 1RM (uppskattat)</div>
              <div className="text-2xl font-bold tabular">{records.best1RM ? fmtWeight(records.best1RM.value, unit) : '–'}</div>
              {records.best1RM && (
                <div className="text-xs text-muted">
                  {records.best1RM.reps} × {fmtWeight(records.best1RM.weight, unit)} · {formatDate(records.best1RM.date)}
                </div>
              )}
            </Card>
          </div>
          {records.repsAtWeight.length > 0 && (
            <Card>
              <h3 className="font-semibold">Flest reps per vikt</h3>
              <table className="mt-2 w-full text-sm tabular">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Vikt</th>
                    <th className="py-1 text-right font-medium">Reps</th>
                    <th className="py-1 text-right font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {records.repsAtWeight.map((r) => (
                    <tr key={r.weight} className="border-t border-border">
                      <td className="py-1.5">{r.weight > 0 ? fmtWeight(r.weight, unit) : 'Kroppsvikt'}</td>
                      <td className="py-1.5 text-right font-semibold">{r.reps}</td>
                      <td className="py-1.5 text-right text-muted">{formatDate(r.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-2 font-bold">Senaste passen</h2>
        <ul className="space-y-2">
          {recent.map((p) => (
            <li key={p.sessionId}>
              <Link to={`/history/${p.sessionId}`} className="block rounded-2xl border border-border bg-surface p-3 active:bg-surface-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{formatDate(p.date)}</span>
                  <span className="truncate text-sm text-muted">{p.sessionName}</span>
                </div>
                <div className="mt-1 text-sm tabular">
                  {p.sets
                    .map((s) => {
                      const base = isTime ? formatDuration(s.durationSec ?? 0) : s.weight > 0 ? `${s.reps} × ${fmtWeight(s.weight, unit, false)}` : `${s.reps} reps`;
                      return s.type === 'working' ? base : `${base} (${SET_TYPE_LABELS[s.type].toLowerCase()})`;
                    })
                    .join(', ')}
                </div>
                {!isTime && hasWeight && <div className="mt-1 text-xs text-muted">Volym {fmtBig(p.volume, unit)}</div>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
