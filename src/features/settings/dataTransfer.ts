// Export / import of all user data.
//  - JSON: full versioned backup of every collection; import merges by id (putMany → synced).
//  - CSV: one row per set (our own format), import also understands Strong and Hevy exports.
// Pure parsing/planning functions are separated from the few DB/DOM functions at the bottom.
import type { Exercise, Program, SessionExercise, SetEntry, SetType, Settings, Unit, WorkoutSession, WorkoutTemplate } from '@/engine';
import { all, getSettings, put, putMany } from '@/db/repo';
import { EXERCISE_ALIASES } from '@/data/exerciseAliases';

// ===================================================================== JSON

export interface ExportBundle {
  app: 'gymlogg';
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  programs: Program[];
  sessions: WorkoutSession[];
  sets: SetEntry[];
  settings: Settings | null;
}

export function buildExportBundle(data: Omit<ExportBundle, 'app' | 'version' | 'exportedAt'>, now = new Date()): ExportBundle {
  return { app: 'gymlogg', version: 1, exportedAt: now.toISOString(), ...data };
}

/** Validate a parsed JSON backup. Throws a Swedish error message when invalid. */
export function parseJsonBackup(text: string): ExportBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('Filen är inte giltig JSON.');
  }
  const b = raw as Partial<ExportBundle>;
  if (!b || typeof b !== 'object' || b.app !== 'gymlogg') throw new Error('Filen är ingen Gymlogg-export.');
  if (b.version !== 1) throw new Error(`Okänd exportversion (${String(b.version)}).`);
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof (x as { id?: unknown }).id === 'string') : []);
  return {
    app: 'gymlogg',
    version: 1,
    exportedAt: String(b.exportedAt ?? ''),
    exercises: arr(b.exercises),
    templates: arr(b.templates),
    programs: arr(b.programs),
    sessions: arr(b.sessions),
    sets: arr(b.sets),
    settings: b.settings && typeof b.settings === 'object' ? ({ ...b.settings, id: 'settings' } as Settings) : null,
  };
}

// ===================================================================== CSV primitives

/** RFC 4180 parser. Handles quotes, escaped quotes, CRLF/LF, a leading BOM. Delimiter auto-detected (, ; or tab) when omitted. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (c === delim) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function detectDelimiter(src: string): string {
  // Look at the first line outside quotes.
  let inQ = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const c of src) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === '\n' || c === '\r')) break;
    else if (!inQ && c in counts) counts[c]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV (comma, CRLF line endings as per RFC 4180). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// ===================================================================== CSV export

export const CSV_HEADER = [
  'date',
  'session',
  'exercise',
  'set_order',
  'set_type',
  'weight_kg',
  'reps',
  'rpe',
  'duration_sec',
  'notes',
  // Extra columns (after the documented ones) so a re-import of our own file merges by id.
  'session_id',
  'set_id',
  'exercise_id',
] as const;

/** One row per set of completed sessions, oldest first. Numbers use "." as decimal separator. */
export function setsToCsv(sessions: WorkoutSession[], sets: SetEntry[], exercises: Map<string, Pick<Exercise, 'name'>>): string {
  const completed = new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
  const rows = sets
    .filter((s) => completed.has(s.sessionId))
    .map((s) => ({ s, session: completed.get(s.sessionId)! }));
  rows.sort(
    (a, b) =>
      a.session.startedAt.localeCompare(b.session.startedAt) ||
      exerciseIndex(a.session, a.s) - exerciseIndex(b.session, b.s) ||
      a.s.order - b.s.order,
  );
  return (
    '﻿' +
    toCsv([
      [...CSV_HEADER],
      ...rows.map(({ s, session }) => {
        const se = session.exercises.find((e) => e.id === s.sessionExerciseId);
        return [
          session.startedAt,
          session.name,
          exercises.get(s.exerciseId)?.name ?? s.exerciseId,
          s.order + 1,
          s.type,
          round(s.weight, 3),
          s.reps,
          s.rpe ?? '',
          s.durationSec ?? '',
          se?.notes ?? '',
          session.id,
          s.id,
          s.exerciseId,
        ];
      }),
    ])
  );
}

function exerciseIndex(session: WorkoutSession, s: SetEntry): number {
  const i = session.exercises.findIndex((e) => e.id === s.sessionExerciseId);
  return i < 0 ? 999 : i;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// ===================================================================== CSV import

export type CsvFormat = 'gymlogg' | 'strong' | 'hevy';

/** A set row normalized from any supported CSV format. */
export interface ImportRow {
  start: string; // ISO timestamp of the workout start
  end: string | null;
  workout: string;
  exercise: string;
  exerciseId: string | null; // only from our own format
  sessionId: string | null; // only from our own format
  setId: string | null; // only from our own format
  setOrder: number;
  type: SetType;
  weightKg: number;
  reps: number;
  rpe: number | null;
  durationSec: number | null;
  notes: string;
}

export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, okt: 9, nov: 10, dec: 11,
};

/** Parse dates like "2023-01-15 08:30:00", "2023-01-15T08:30:00Z", "15 Jan 2023, 08:30" (local time when no zone). */
export function parseLooseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{1,2})\s+([A-Za-zåäö]+)\.?\s+(\d{4}),?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon !== undefined) return new Date(+m[3], mon, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const LB = 0.45359237;

function mapSetType(raw: string): SetType {
  const t = raw.trim().toLowerCase();
  if (t === 'w' || t.startsWith('warm')) return 'warmup';
  if (t === 'd' || t.startsWith('drop')) return 'drop';
  if (t === 'f' || t.startsWith('fail')) return 'failure';
  return 'working';
}

export function detectCsvFormat(header: string[]): CsvFormat | null {
  const h = header.map((x) => x.trim().toLowerCase());
  if (h.includes('exercise') && h.includes('set_type') && h.includes('weight_kg') && h.includes('session')) return 'gymlogg';
  if (h.includes('exercise_title') && h.includes('start_time')) return 'hevy';
  if (h.includes('exercise name') && h.includes('date')) return 'strong';
  return null;
}

/**
 * Parse a CSV export into normalized rows.
 * `fallbackUnit` is used for Strong exports whose weight column doesn't state a unit.
 */
export function parseImportCsv(text: string, fallbackUnit: Unit = 'kg'): { format: CsvFormat; rows: ImportRow[]; skipped: number } {
  const table = parseCsv(text);
  if (!table.length) throw new Error('Filen är tom.');
  const header = table[0].map((x) => x.trim());
  const format = detectCsvFormat(header);
  if (!format) throw new Error('Okänt CSV-format. Stöds: Gymlogg, Strong och Hevy.');
  const lower = header.map((x) => x.toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = lower.indexOf(n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  const rows: ImportRow[] = [];
  let skipped = 0;
  const body = table.slice(1);

  if (format === 'gymlogg') {
    const c = {
      date: col('date'), session: col('session'), exercise: col('exercise'), order: col('set_order'), type: col('set_type'),
      weight: col('weight_kg'), reps: col('reps'), rpe: col('rpe'), dur: col('duration_sec'), notes: col('notes'),
      sessionId: col('session_id'), setId: col('set_id'), exerciseId: col('exercise_id'),
    };
    for (const r of body) {
      const start = parseLooseDate(get(r, c.date));
      const exercise = get(r, c.exercise);
      if (!start || !exercise) {
        skipped++;
        continue;
      }
      rows.push({
        start: start.toISOString(),
        end: null,
        workout: get(r, c.session) || 'Importerat pass',
        exercise,
        exerciseId: get(r, c.exerciseId) || null,
        sessionId: get(r, c.sessionId) || null,
        setId: get(r, c.setId) || null,
        setOrder: num(get(r, c.order)) ?? rows.length + 1,
        type: mapSetType(get(r, c.type)),
        weightKg: num(get(r, c.weight)) ?? 0,
        reps: Math.round(num(get(r, c.reps)) ?? 0),
        rpe: num(get(r, c.rpe)),
        durationSec: num(get(r, c.dur)),
        notes: get(r, c.notes),
      });
    }
  } else if (format === 'strong') {
    const weightIdx = lower.findIndex((x) => x === 'weight' || x.startsWith('weight ('));
    const unitIdx = col('weight unit');
    const headerUnit: Unit | null = weightIdx >= 0 && /lb/.test(lower[weightIdx]) ? 'lb' : weightIdx >= 0 && /kg/.test(lower[weightIdx]) ? 'kg' : null;
    const c = {
      date: col('date'), workout: col('workout name'), exercise: col('exercise name'), order: col('set order'),
      reps: col('reps'), rpe: col('rpe'), secs: col('seconds'), notes: col('notes'), duration: col('duration'),
    };
    for (const r of body) {
      const start = parseLooseDate(get(r, c.date));
      const exercise = get(r, c.exercise);
      const orderRaw = get(r, c.order);
      if (!start || !exercise || /rest/i.test(orderRaw)) {
        skipped++;
        continue;
      }
      const rowUnit = unitIdx >= 0 ? (/lb/i.test(get(r, unitIdx)) ? 'lb' : 'kg') : (headerUnit ?? fallbackUnit);
      const w = num(get(r, weightIdx)) ?? 0;
      const secs = num(get(r, c.secs));
      const reps = Math.round(num(get(r, c.reps)) ?? 0);
      if (!reps && !secs && !w) {
        skipped++;
        continue;
      }
      const end = parseStrongDuration(get(r, c.duration));
      rows.push({
        start: start.toISOString(),
        end: end ? new Date(start.getTime() + end * 1000).toISOString() : null,
        workout: get(r, c.workout) || 'Importerat pass',
        exercise,
        exerciseId: null,
        sessionId: null,
        setId: null,
        setOrder: num(orderRaw) ?? rows.length + 1,
        type: mapSetType(orderRaw),
        weightKg: rowUnit === 'lb' ? w * LB : w,
        reps,
        rpe: num(get(r, c.rpe)) || null,
        durationSec: secs || null,
        notes: get(r, c.notes),
      });
    }
  } else {
    const kgIdx = col('weight_kg');
    const lbIdx = col('weight_lbs', 'weight_lb');
    const c = {
      title: col('title'), start: col('start_time'), end: col('end_time'), exercise: col('exercise_title'), order: col('set_index'),
      type: col('set_type'), reps: col('reps'), rpe: col('rpe'), dur: col('duration_seconds'), notes: col('exercise_notes'),
    };
    for (const r of body) {
      const start = parseLooseDate(get(r, c.start));
      const exercise = get(r, c.exercise);
      if (!start || !exercise) {
        skipped++;
        continue;
      }
      const end = parseLooseDate(get(r, c.end));
      const w = kgIdx >= 0 ? num(get(r, kgIdx)) ?? 0 : (num(get(r, lbIdx)) ?? 0) * LB;
      rows.push({
        start: start.toISOString(),
        end: end ? end.toISOString() : null,
        workout: get(r, c.title) || 'Importerat pass',
        exercise,
        exerciseId: null,
        sessionId: null,
        setId: null,
        setOrder: (num(get(r, c.order)) ?? rows.length) + 1, // Hevy set_index is 0-based
        type: mapSetType(get(r, c.type)),
        weightKg: w,
        reps: Math.round(num(get(r, c.reps)) ?? 0),
        rpe: num(get(r, c.rpe)),
        durationSec: num(get(r, c.dur)) || null,
        notes: get(r, c.notes),
      });
    }
  }
  return { format, rows, skipped };
}

/** Strong durations like "1h 5m", "45m", "3600" → seconds. */
function parseStrongDuration(s: string): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const h = /(\d+)\s*h/.exec(s);
  const m = /(\d+)\s*m/.exec(s);
  const sec = /(\d+)\s*s/.exec(s);
  const total = (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (sec ? +sec[1] : 0);
  return total || null;
}

// ---------- planning ----------

export interface ImportPlan {
  format: CsvFormat | 'json';
  exercises: Exercise[]; // new custom exercises (CSV) or all exercises (JSON)
  newExerciseNames: string[];
  templates: WorkoutTemplate[];
  programs: Program[];
  sessions: WorkoutSession[];
  sets: SetEntry[];
  settings: Settings | null;
  skipped: number;
}

/** Small deterministic hash (FNV-1a, hex) so re-importing the same file overwrites instead of duplicating. */
export function hashId(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function newCustomExercise(id: string, name: string, timeBased: boolean): Exercise {
  return {
    id,
    name,
    primaryMuscle: 'full_body',
    secondaryMuscles: [],
    equipment: 'other',
    category: 'compound',
    measure: timeBased ? 'time' : 'weight_reps',
    unilateral: false,
    bodyweightMode: 'none',
    weightStep: null,
    notes: '',
    isCustom: true,
    isFavorite: false,
  };
}

/**
 * Turn normalized rows into sessions/sets. Exercise names are matched case- and
 * diacritic-insensitively against `existing`; unknown names become custom exercises.
 * Rows are grouped into completed sessions by workout start + workout name.
 */
export function planCsvImport(
  parsed: { format: CsvFormat; rows: ImportRow[]; skipped: number },
  existing: Exercise[],
  defaults: { restSec: number; rule: Settings['defaultRule'] } = { restSec: 120, rule: 'double' },
): ImportPlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byName = new Map<string, Exercise>();
  for (const e of existing) if (!byName.has(normalizeName(e.name))) byName.set(normalizeName(e.name), e);
  // English Strong/Hevy names → built-in exercises (only when the built-in still exists).
  for (const [id, names] of Object.entries(EXERCISE_ALIASES)) {
    const e = byId.get(id);
    if (!e) continue;
    for (const n of names) if (!byName.has(normalizeName(n))) byName.set(normalizeName(n), e);
  }

  const created = new Map<string, Exercise>();
  const resolveExercise = (row: ImportRow, timeBased: boolean): Exercise => {
    if (row.exerciseId && byId.has(row.exerciseId)) return byId.get(row.exerciseId)!;
    const key = normalizeName(row.exercise);
    const hit = byName.get(key) ?? created.get(key);
    if (hit) return hit;
    const ex = newCustomExercise(row.exerciseId ?? `custom-${hashId('ex|' + key)}`, row.exercise.trim(), timeBased);
    created.set(key, ex);
    return ex;
  };

  // Which exercise names are purely time-based (no reps, has durations)?
  const timeBased = new Map<string, boolean>();
  for (const r of parsed.rows) {
    const key = normalizeName(r.exercise);
    const isTime = !r.reps && !!r.durationSec;
    timeBased.set(key, (timeBased.get(key) ?? true) && isTime);
  }

  // Group into sessions (preserving first-appearance order of exercises).
  const groups = new Map<string, ImportRow[]>();
  for (const r of parsed.rows) {
    const key = r.sessionId ?? `${r.start}|${r.workout}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const sessions: WorkoutSession[] = [];
  const sets: SetEntry[] = [];
  for (const [key, rows] of groups) {
    const sessionId = rows[0].sessionId ?? `imp-${hashId(key)}`;
    const startMs = new Date(rows[0].start).getTime();
    const exOrder: { ex: Exercise; rows: ImportRow[] }[] = [];
    for (const r of rows) {
      const ex = resolveExercise(r, timeBased.get(normalizeName(r.exercise)) ?? false);
      let entry = exOrder.find((e) => e.ex.id === ex.id);
      if (!entry) exOrder.push((entry = { ex, rows: [] }));
      entry.rows.push(r);
    }
    const exercises: SessionExercise[] = [];
    let setCounter = 0;
    for (const { ex, rows: exRows } of exOrder) {
      exRows.sort((a, b) => a.setOrder - b.setOrder);
      const seId = `${sessionId}-e${exercises.length}`;
      const working = exRows.filter((r) => r.type !== 'warmup');
      const reps = working.map((r) => r.reps).filter((n) => n > 0);
      exercises.push({
        id: seId,
        exerciseId: ex.id,
        supersetGroup: null,
        notes: exRows.find((r) => r.notes)?.notes ?? '',
        suggestion: null,
        sets: working.length || exRows.length,
        repMin: reps.length ? Math.min(...reps) : 8,
        repMax: reps.length ? Math.max(...reps) : 12,
        targetRpe: null,
        restSec: defaults.restSec,
        warmupSets: exRows.length - working.length,
        rule: defaults.rule,
      });
      exRows.forEach((r, i) => {
        sets.push({
          id: r.setId ?? `${sessionId}-s${setCounter}`,
          sessionId,
          sessionExerciseId: seId,
          exerciseId: ex.id,
          order: i,
          type: r.type,
          reps: r.reps,
          weight: round(r.weightKg, 3),
          durationSec: r.durationSec,
          rpe: r.rpe,
          // Spread set times ~3 min apart (exact times are not in the exports).
          completedAt: new Date(startMs + (setCounter + 1) * 180_000).toISOString(),
        });
        setCounter++;
      });
    }
    const endedAt = rows.find((r) => r.end)?.end ?? new Date(startMs + Math.max(1, setCounter) * 180_000).toISOString();
    sessions.push({
      id: sessionId,
      name: rows[0].workout,
      templateId: null,
      programId: null,
      status: 'completed',
      startedAt: rows[0].start,
      endedAt,
      notes: '',
      exercises,
    });
  }
  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const newExercises = [...created.values()];
  return {
    format: parsed.format,
    exercises: newExercises,
    newExerciseNames: newExercises.map((e) => e.name),
    templates: [],
    programs: [],
    sessions,
    sets,
    settings: null,
    skipped: parsed.skipped,
  };
}

export function planJsonImport(bundle: ExportBundle): ImportPlan {
  return {
    format: 'json',
    exercises: bundle.exercises,
    newExerciseNames: [],
    templates: bundle.templates,
    programs: bundle.programs,
    sessions: bundle.sessions,
    sets: bundle.sets,
    settings: bundle.settings,
    skipped: 0,
  };
}

/** Swedish one-line summary, e.g. "12 pass, 340 set, 3 nya övningar". */
export function summarizePlan(plan: ImportPlan): string {
  const parts = [`${plan.sessions.length} pass`, `${plan.sets.length} set`];
  if (plan.format === 'json') {
    parts.push(`${plan.exercises.length} övningar`, `${plan.templates.length} mallar`, `${plan.programs.length} program`);
    if (plan.settings) parts.push('inställningar');
  } else {
    const n = plan.exercises.length;
    parts.push(`${n} ${n === 1 ? 'ny övning' : 'nya övningar'}`);
  }
  return parts.join(', ');
}

// ===================================================================== DB + DOM side effects

export async function loadExportBundle(now = new Date()): Promise<ExportBundle> {
  const [exercises, templates, programs, sessions, sets, settings] = await Promise.all([
    all('exercises'),
    all('templates'),
    all('programs'),
    all('sessions'),
    all('sets'),
    getSettings(),
  ]);
  return buildExportBundle({ exercises, templates, programs, sessions, sets, settings }, now);
}

export async function loadSetsCsv(): Promise<string> {
  const [exercises, sessions, sets] = await Promise.all([all('exercises'), all('sessions'), all('sets')]);
  return setsToCsv(sessions, sets, new Map(exercises.map((e) => [e.id, e])));
}

/** Parse a file's text as JSON backup or CSV and plan the import (does not write anything). */
export async function planImportFromText(text: string, fileName = ''): Promise<ImportPlan> {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{')) return planJsonImport(parseJsonBackup(text));
  const settings = await getSettings();
  const parsed = parseImportCsv(text, settings.unit);
  if (!parsed.rows.length) throw new Error('Hittade inga set att importera.');
  return planCsvImport(parsed, await all('exercises'), { restSec: settings.defaultRestSec, rule: settings.defaultRule });
}

/** Write a planned import (merge by id; rows are marked dirty so they sync). */
export async function commitImport(plan: ImportPlan): Promise<void> {
  await putMany('exercises', plan.exercises);
  await putMany('templates', plan.templates);
  await putMany('programs', plan.programs);
  await putMany('sessions', plan.sessions);
  await putMany('sets', plan.sets);
  if (plan.settings) await put('settings', { ...(await getSettings()), ...plan.settings, id: 'settings' });
}

export function fileStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Trigger a browser download of `content`. */
export function downloadFile(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportJson(): Promise<void> {
  const bundle = await loadExportBundle();
  downloadFile(`gymlogg-${fileStamp()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
}

export async function exportCsv(): Promise<void> {
  downloadFile(`gymlogg-${fileStamp()}.csv`, await loadSetsCsv(), 'text/csv;charset=utf-8');
}
