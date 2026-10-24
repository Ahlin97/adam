// Pure logic for the Apple Watch API (no I/O). index.ts fetches rows and calls these functions.
// Everything here works on the same domain objects as the web app (src/engine/types.ts).
import {
  buildSession,
  formatWeight,
  kgToUnit,
  nextSetInSession,
  scheduledTemplateId,
  summarizeSession,
  unitToKg,
  type Exercise,
  type ExerciseHistoryEntry,
  type NextSet,
  type Program,
  type SessionExercise,
  type SetEntry,
  type Settings,
  type Unit,
  type WorkoutSession,
  type WorkoutTemplate,
} from '../_shared/engine/index.ts';

// ---------- Settings ----------

/** Copy of DEFAULT_SETTINGS in src/db/repo.ts – keep in sync. */
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  unit: 'kg',
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbells: [],
  kettlebells: [8, 12, 16, 20, 24, 28, 32, 36, 40, 48],
  defaultSteps: {
    barbellLower: 5,
    barbellUpper: 2.5,
    dumbbell: 2,
    machine: 5,
    cable: 5,
    kettlebell: 4,
    bodyweight: 2.5,
    other: 2.5,
  },
  defaultRestSec: 120,
  defaultRule: 'double',
  activeProgramId: null,
  soundEnabled: true,
  vibrationEnabled: true,
  remindersEnabled: false,
  reminderTime: '17:00',
  bodyWeight: null,
};

export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    id: 'settings',
    defaultSteps: { ...DEFAULT_SETTINGS.defaultSteps, ...(raw?.defaultSteps ?? {}) },
  };
}

// ---------- Errors ----------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- Input parsing ----------

/** Accepts numbers and strings like "82,5", " 8 ", "82.5 kg". Returns null for empty/missing. */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'boolean') return NaN;
  const s = String(v)
    .trim()
    .replace(/\s| /g, '')
    .replace(/(kg|lb|lbs|st|reps?)$/i, '')
    .replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export interface LogInput {
  reps: number | null;
  /** In the user's unit. */
  weight: number | null;
  rpe: number | null;
  sessionExerciseId: string | null;
}

export function parseLogInput(raw: Record<string, unknown>): LogInput {
  const reps = parseNumber(raw.reps);
  const weight = parseNumber(raw.weight ?? raw.vikt);
  const rpe = parseNumber(raw.rpe);
  if (reps !== null && (Number.isNaN(reps) || reps < 0 || reps > 1000 || !Number.isInteger(reps))) {
    throw new ApiError(400, 'Ogiltigt antal reps – ange ett heltal, t.ex. 8.');
  }
  if (weight !== null && (Number.isNaN(weight) || weight < 0 || weight > 2000)) {
    throw new ApiError(400, 'Ogiltig vikt – ange ett tal, t.ex. 82,5.');
  }
  if (rpe !== null && (Number.isNaN(rpe) || rpe < 1 || rpe > 10)) {
    throw new ApiError(400, 'Ogiltigt RPE – ange ett värde mellan 6 och 10.');
  }
  const seId = raw.sessionExerciseId;
  return {
    reps,
    weight,
    rpe,
    sessionExerciseId: typeof seId === 'string' && seId.trim() ? seId.trim() : null,
  };
}

// ---------- Time ----------

/**
 * A Date whose UTC fields equal the wall-clock time in `tz`. Edge functions run in UTC, so the
 * engine's getDay()/getDate() on this value give the user's local weekday/date.
 */
export function wallClock(now: Date, tz: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
  } catch {
    return new Date(now);
  }
}

/** "2026-10-24" in the given time zone. */
export function localDayKey(d: Date | string, tz: string): string {
  return wallClock(new Date(d), tz).toISOString().slice(0, 10);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------- Formatting ----------

/** 120 → "2:00", 90 → "1:30". */
export function formatRest(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Weight text for a set, aware of bodyweight / time exercises. */
export function weightText(kg: number | null, ex: Exercise | undefined, unit: Unit): string {
  if (ex?.measure === 'time') return '';
  if (ex?.measure === 'bodyweight_reps') {
    if (!kg) return 'kroppsvikt';
    return ex?.bodyweightMode === 'assisted'
      ? `kroppsvikt − ${formatWeight(kg, unit)} assistans`
      : `kroppsvikt + ${formatWeight(kg, unit)}`;
  }
  if (kg === null) return 'valfri vikt';
  return formatWeight(kg, unit);
}

function setTypeLabel(type: SetEntry['type']): string {
  switch (type) {
    case 'warmup':
      return ' (uppvärmning)';
    case 'drop':
      return ' (dropset)';
    case 'failure':
      return ' (till failure)';
    default:
      return '';
  }
}

/** "8 × 82,5 kg", "8 × kroppsvikt", "45 s". */
export function setText(reps: number, kg: number | null, ex: Exercise | undefined, unit: Unit, durationSec?: number | null): string {
  if (ex?.measure === 'time') return `${durationSec ?? reps} s`;
  if (kg === null && ex?.measure !== 'bodyweight_reps') return `${reps} reps`;
  return `${reps} × ${weightText(kg, ex, unit)}`;
}

// ---------- Responses ----------

export interface NextResponse {
  done: boolean;
  sessionId: string | null;
  sessionName?: string;
  exercise?: string;
  exerciseId?: string;
  sessionExerciseId?: string;
  setNumber?: number;
  totalSets?: number;
  type?: SetEntry['type'];
  /** Reps (or seconds for time exercises). */
  reps?: number;
  /** Weight in the user's unit (null = first time, no suggestion). */
  weight?: number | null;
  weightKg?: number | null;
  weightText?: string;
  unit: Unit;
  measure?: Exercise['measure'];
  restSec?: number;
  restText?: string;
  reason?: string;
  completedSets: number;
  plannedSets: number;
  text: string;
}

function exerciseName(ex: Exercise | undefined): string {
  return ex?.name ?? 'Okänd övning';
}

function plannedSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((n, e) => n + e.sets + (e.warmupSets ?? 0), 0);
}

export function describeNext(
  session: WorkoutSession,
  sets: SetEntry[],
  exercises: Map<string, Exercise>,
  settings: Settings,
): NextResponse {
  const unit = settings.unit;
  const next = nextSetInSession(session, sets, { exercises, profile: settings });
  const base = {
    sessionId: session.id,
    sessionName: session.name,
    unit,
    completedSets: sets.length,
    plannedSets: plannedSetCount(session),
  };
  if (!next) {
    return { ...base, done: true, text: 'Alla set klara! Avsluta passet?' };
  }
  const ex = exercises.get(next.exerciseId);
  const se = session.exercises.find((e) => e.id === next.sessionExerciseId);
  const name = exerciseName(ex);
  const wText = weightText(next.weight, ex, unit);
  const what = setText(next.reps, next.weight, ex, unit);
  let text = `${name} – set ${next.setNumber} av ${next.totalSets}${setTypeLabel(next.type)}: ${what}`;
  if (next.weight === null && ex?.measure === 'weight_reps') text += '. Första gången – ange startvikt';
  return {
    ...base,
    done: false,
    exercise: name,
    exerciseId: next.exerciseId,
    sessionExerciseId: next.sessionExerciseId,
    setNumber: next.setNumber,
    totalSets: next.totalSets,
    type: next.type,
    reps: next.reps,
    weight: next.weight === null ? null : round2(kgToUnit(next.weight, unit)),
    weightKg: next.weight,
    weightText: wText,
    measure: ex?.measure,
    restSec: next.restSec,
    restText: formatRest(next.restSec),
    reason: se?.suggestion?.reason ?? '',
    text,
  };
}

/**
 * The set that should be logged: the session's next set, or – when the client names a specific
 * session exercise – the next set of that exercise.
 */
export function targetSet(
  session: WorkoutSession,
  sets: SetEntry[],
  sessionExerciseId: string | null,
  exercises: Map<string, Exercise>,
  settings: Settings,
): NextSet {
  const opts = { exercises, profile: settings };
  if (!sessionExerciseId) {
    const next = nextSetInSession(session, sets, opts);
    if (!next) throw new ApiError(409, 'Alla set är redan klara. Avsluta passet eller lägg till set i appen.');
    return next;
  }
  const se: SessionExercise | undefined = session.exercises.find((e) => e.id === sessionExerciseId);
  if (!se) throw new ApiError(404, 'Övningen finns inte i det pågående passet.');
  // Same rules as the engine, restricted to this exercise.
  const next = nextSetInSession({ ...session, exercises: [{ ...se, supersetGroup: null }] }, sets, opts);
  if (!next) throw new ApiError(409, `Alla set för ${exerciseName(exercises.get(se.exerciseId))} är redan klara.`);
  return next;
}

/** Build the SetEntry to insert. Throws ApiError on missing/invalid data. */
export function makeSetEntry(args: {
  id: string;
  session: WorkoutSession;
  sets: SetEntry[];
  target: NextSet;
  input: LogInput;
  exercise: Exercise | undefined;
  unit: Unit;
  now: Date;
}): SetEntry {
  const { id, session, sets, target, input, exercise, unit, now } = args;
  const reps = input.reps ?? target.reps;
  const isTime = exercise?.measure === 'time';
  let weightKg: number;
  if (isTime) {
    weightKg = 0;
  } else if (input.weight !== null) {
    weightKg = round2(unitToKg(input.weight, unit));
  } else if (target.weight !== null) {
    weightKg = target.weight;
  } else if (exercise?.measure === 'bodyweight_reps') {
    weightKg = 0;
  } else {
    throw new ApiError(400, `Ange vikt – det finns inget förslag för ${exerciseName(exercise)} ännu.`);
  }
  return {
    id,
    sessionId: session.id,
    sessionExerciseId: target.sessionExerciseId,
    exerciseId: target.exerciseId,
    order: sets.filter((s) => s.sessionExerciseId === target.sessionExerciseId).length,
    type: target.type,
    reps: isTime ? 0 : reps,
    weight: weightKg,
    durationSec: isTime ? reps : null,
    rpe: input.rpe,
    completedAt: now.toISOString(),
  };
}

export interface LogResponse extends NextResponse {
  logged: string;
  loggedSet: SetEntry;
}

export function describeLogged(
  entry: SetEntry,
  session: WorkoutSession,
  setsAfter: SetEntry[],
  exercises: Map<string, Exercise>,
  settings: Settings,
  restSec: number,
): LogResponse {
  const ex = exercises.get(entry.exerciseId);
  const next = describeNext(session, setsAfter, exercises, settings);
  const what = setText(entry.reps, entry.weight, ex, settings.unit, entry.durationSec);
  const logged = `Loggat: ${exerciseName(ex)} ${what}.`;
  const text = next.done
    ? `${logged} Alla set klara! Avsluta passet?`
    : `${logged} Vila ${formatRest(restSec)}. Nästa: ${next.text}`;
  return { ...next, logged, loggedSet: entry, text };
}

export function finishSession(session: WorkoutSession, now: Date): WorkoutSession {
  return { ...session, status: 'completed', endedAt: now.toISOString() };
}

export function describeFinished(session: WorkoutSession, sets: SetEntry[], settings: Settings, now: Date) {
  const sum = summarizeSession(session, sets, now);
  const min = Math.max(1, Math.round(sum.durationSec / 60));
  const vol = formatWeight(sum.volumeKg, settings.unit);
  return {
    done: true,
    sessionId: session.id,
    durationSec: sum.durationSec,
    setCount: sum.setCount,
    volumeKg: sum.volumeKg,
    text: `Passet ${session.name} är avslutat: ${sum.setCount} set på ${min} min, total volym ${vol}. Bra jobbat!`,
  };
}

// ---------- Active session & starting today's session ----------

export function pickActiveSession(sessions: WorkoutSession[]): WorkoutSession | null {
  const active = sessions.filter((s) => s.status === 'active');
  active.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return active[0] ?? null;
}

/**
 * History per exercise in the same shape as getExerciseHistory in src/db/repo.ts:
 * completed sessions only, newest first.
 */
export function buildHistories(
  exerciseIds: Iterable<string>,
  sessions: WorkoutSession[],
  sets: SetEntry[],
  excludeSessionId?: string,
): Map<string, ExerciseHistoryEntry[]> {
  const wanted = new Set(exerciseIds);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  // exerciseId -> sessionId -> sets
  const grouped = new Map<string, Map<string, SetEntry[]>>();
  for (const set of sets) {
    if (!wanted.has(set.exerciseId) || set.sessionId === excludeSessionId) continue;
    const byEx = grouped.get(set.exerciseId) ?? new Map<string, SetEntry[]>();
    const list = byEx.get(set.sessionId) ?? [];
    list.push(set);
    byEx.set(set.sessionId, list);
    grouped.set(set.exerciseId, byEx);
  }
  const out = new Map<string, ExerciseHistoryEntry[]>();
  for (const exId of wanted) {
    const entries: ExerciseHistoryEntry[] = [];
    for (const [sessionId, list] of grouped.get(exId) ?? []) {
      const session = sessionById.get(sessionId);
      if (!session || session.status !== 'completed') continue;
      const sorted = [...list].sort((a, b) => a.order - b.order);
      const se = session.exercises.find((e) => e.exerciseId === exId);
      entries.push({
        sessionId,
        date: session.startedAt,
        sets: sorted.map(({ type, reps, weight, rpe, durationSec }) => ({ type, reps, weight, rpe, durationSec })),
        prescription: se ?? {
          sets: sorted.length,
          repMin: 8,
          repMax: 12,
          targetRpe: null,
          restSec: 120,
          warmupSets: 0,
          rule: 'double',
        },
      });
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    out.set(exId, entries);
  }
  return out;
}

export type TodayPlan =
  | { kind: 'no_program'; text: string }
  | { kind: 'rest'; text: string; program: Program }
  | { kind: 'missing_template'; text: string }
  | { kind: 'already_done'; text: string; session: WorkoutSession }
  | { kind: 'train'; template: WorkoutTemplate; program: Program | null; text: string };

type ScheduleSession = Pick<WorkoutSession, 'id' | 'name' | 'programId' | 'templateId' | 'startedAt' | 'status'>;

/** Decide what to train today. `templateId` overrides the schedule. */
export function planToday(args: {
  settings: Settings;
  programs: Program[];
  templates: WorkoutTemplate[];
  completed: ScheduleSession[];
  now: Date;
  tz: string;
  templateId?: string | null;
  force?: boolean;
}): TodayPlan {
  const { settings, programs, templates, completed, now, tz } = args;
  const program = programs.find((p) => p.id === settings.activeProgramId) ?? null;
  if (args.templateId) {
    const t = templates.find((x) => x.id === args.templateId || x.name.toLowerCase() === args.templateId!.toLowerCase());
    if (!t) return { kind: 'missing_template', text: 'Hittar inte passmallen.' };
    return { kind: 'train', template: t, program, text: `Idag: ${t.name}` };
  }
  if (!program) {
    return { kind: 'no_program', text: 'Inget aktivt program. Välj ett program i appen eller starta passet där.' };
  }
  const today = localDayKey(now, tz);
  if (!args.force) {
    const doneToday = completed
      .filter((s) => s.status === 'completed' && localDayKey(s.startedAt, tz) === today)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (doneToday) {
      return {
        kind: 'already_done',
        session: doneToday as WorkoutSession,
        text: `Dagens pass (${doneToday.name}) är redan klart. Bra jobbat!`,
      };
    }
  }
  const tid = scheduledTemplateId(program, completed, wallClock(now, tz));
  if (!tid) return { kind: 'rest', program, text: 'Vilodag idag' };
  const template = templates.find((t) => t.id === tid);
  if (!template) return { kind: 'missing_template', text: 'Dagens passmall saknas. Kontrollera programmet i appen.' };
  return { kind: 'train', template, program, text: `Idag: ${template.name}` };
}

export function startSession(args: {
  id: string;
  newId: () => string;
  template: WorkoutTemplate;
  program: Program | null;
  exercises: Map<string, Exercise>;
  histories: Map<string, ExerciseHistoryEntry[]>;
  settings: Settings;
  now: Date;
}): WorkoutSession {
  return buildSession({
    id: args.id,
    newId: args.newId,
    template: args.template,
    programId: args.program?.id ?? null,
    exercises: args.exercises,
    histories: args.histories,
    profile: args.settings,
    now: args.now,
  });
}

/** Short overview of today's training for GET /today. */
export function describeToday(args: {
  active: WorkoutSession | null;
  activeSets: SetEntry[];
  plan: TodayPlan | null;
  exercises: Map<string, Exercise>;
  settings: Settings;
}): { text: string; sessionId: string | null; status: 'active' | 'done' | 'planned' | 'rest' | 'none' } {
  const { active, activeSets, plan, exercises, settings } = args;
  if (active) {
    const next = describeNext(active, activeSets, exercises, settings);
    const head = `Pågående pass: ${active.name} – ${active.exercises.length} ${active.exercises.length === 1 ? 'övning' : 'övningar'}, ${next.completedSets} av ${next.plannedSets} set klara.`;
    return {
      sessionId: active.id,
      status: 'active',
      text: next.done ? `${head} Alla set klara! Avsluta passet?` : `${head} Nästa: ${next.text}`,
    };
  }
  if (!plan) return { sessionId: null, status: 'none', text: 'Inget pass idag.' };
  switch (plan.kind) {
    case 'train': {
      const names = plan.template.exercises
        .map((te) => exercises.get(te.exerciseId)?.name)
        .filter(Boolean)
        .join(', ');
      return {
        sessionId: null,
        status: 'planned',
        text: `Idag: ${plan.template.name} – ${plan.template.exercises.length} ${plan.template.exercises.length === 1 ? 'övning' : 'övningar'}${names ? ` (${names})` : ''}. Kör "Nästa set" för att starta.`,
      };
    }
    case 'already_done':
      return { sessionId: plan.session.id, status: 'done', text: plan.text };
    case 'rest':
      return { sessionId: null, status: 'rest', text: plan.text };
    default:
      return { sessionId: null, status: 'none', text: plan.text };
  }
}

// ---------- Routing ----------

export type Action = 'next' | 'start' | 'log' | 'finish' | 'today';
const ACTIONS: Action[] = ['next', 'start', 'log', 'finish', 'today'];

/** "/watch/next", "/functions/v1/watch/log", "?action=finish" → action. Defaults to "next". */
export function resolveAction(url: URL): Action | null {
  const q = url.searchParams.get('action');
  if (q) return (ACTIONS as string[]).includes(q.toLowerCase()) ? (q.toLowerCase() as Action) : null;
  const parts = url.pathname.split('/').filter(Boolean);
  const i = parts.lastIndexOf('watch');
  const rest = i >= 0 ? parts.slice(i + 1) : parts;
  if (rest.length === 0) return 'next';
  const a = rest[0].toLowerCase();
  return (ACTIONS as string[]).includes(a) ? (a as Action) : null;
}

export function truthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v !== 'string') return false;
  return ['1', 'true', 'ja', 'yes', 'on'].includes(v.trim().toLowerCase());
}

// ---------- API keys ----------

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function extractApiKey(req: Request, url: URL): string | null {
  const header = req.headers.get('x-api-key');
  if (header?.trim()) return header.trim();
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1].trim().startsWith('gl_')) return m[1].trim();
  }
  const q = url.searchParams.get('key');
  return q?.trim() || null;
}
