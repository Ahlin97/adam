// Apple Watch / iOS Shortcuts API for Gymlogg.
// Deploy: npm run engine:sync && supabase functions deploy watch --no-verify-jwt
// Auth: personal API key (Settings → Apple Watch in the app) in `x-api-key`,
// `Authorization: Bearer gl_…` or `?key=gl_…`.
// Endpoints (all answer JSON with a Swedish `text` field ready to show/speak):
//   GET  /watch/next[?start=1]     next set of the active session (start=1 starts today's session)
//   POST /watch/start              start today's session (or ?templateId=…) and return the first set
//   POST /watch/log                { reps, weight?, rpe?, sessionExerciseId? } → logs set, returns next set
//   POST /watch/finish             completes the active session
//   GET  /watch/today              short overview of today
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Exercise, Program, SetEntry, Settings, WorkoutSession, WorkoutTemplate } from '../_shared/engine/index.ts';
import {
  ApiError,
  buildHistories,
  describeFinished,
  describeLogged,
  describeNext,
  describeToday,
  extractApiKey,
  finishSession,
  isValidTimeZone,
  makeSetEntry,
  mergeSettings,
  parseLogInput,
  pickActiveSession,
  planToday,
  resolveAction,
  sha256Hex,
  startSession,
  targetSet,
  truthy,
  type Action,
} from './logic.ts';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(status: number, message: string): Response {
  return json({ error: message, text: message }, status);
}

type Table = 'exercises' | 'templates' | 'programs' | 'sessions' | 'sets' | 'settings';
type Db = SupabaseClient;

const PAGE = 1000;

/** All non-deleted `data` objects of a table for the user, optionally filtered. */
async function fetchAll<T>(
  db: Db,
  table: Table,
  userId: string,
  // deno-lint-ignore no-explicit-any
  filter?: (q: any) => any,
  columns = 'data',
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(columns).eq('user_id', userId).eq('deleted', false);
    if (filter) q = filter(q);
    const { data, error } = await q.order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) out.push((columns === 'data' ? r.data : r) as T);
    if (rows.length < PAGE) return out;
  }
}

async function authenticate(db: Db, req: Request, url: URL): Promise<string> {
  const key = extractApiKey(req, url);
  if (!key) throw new ApiError(401, 'API-nyckel saknas. Skicka den i headern x-api-key.');
  const hash = await sha256Hex(key);
  const { data, error } = await db.from('api_keys').select('id, user_id').eq('key_hash', hash).maybeSingle();
  if (error) throw new Error(`api_keys: ${error.message}`);
  if (!data) throw new ApiError(401, 'Ogiltig API-nyckel. Skapa en ny under Inställningar → Apple Watch.');
  await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data.user_id as string;
}

class UserData {
  private exerciseMap: Map<string, Exercise> | null = null;
  private settingsCache: Settings | null = null;
  constructor(
    private db: Db,
    private userId: string,
  ) {}

  async settings(): Promise<Settings> {
    if (!this.settingsCache) {
      const { data, error } = await this.db
        .from('settings')
        .select('data, deleted')
        .eq('user_id', this.userId)
        .eq('id', 'settings')
        .maybeSingle();
      if (error) throw new Error(`settings: ${error.message}`);
      this.settingsCache = mergeSettings(data && !data.deleted ? (data.data as Partial<Settings>) : null);
    }
    return this.settingsCache;
  }

  async exercises(): Promise<Map<string, Exercise>> {
    if (!this.exerciseMap) {
      const list = await fetchAll<Exercise>(this.db, 'exercises', this.userId);
      this.exerciseMap = new Map(list.map((e) => [e.id, e]));
    }
    return this.exerciseMap;
  }

  async activeSession(): Promise<WorkoutSession | null> {
    const list = await fetchAll<WorkoutSession>(this.db, 'sessions', this.userId, (q) => q.eq('data->>status', 'active'));
    return pickActiveSession(list);
  }

  sessionSets(sessionId: string): Promise<SetEntry[]> {
    return fetchAll<SetEntry>(this.db, 'sets', this.userId, (q) => q.eq('data->>sessionId', sessionId)).then((s) =>
      s.sort((a, b) => a.order - b.order || a.completedAt.localeCompare(b.completedAt)),
    );
  }

  /** Lightweight list of completed sessions for scheduling. */
  async completedSessions() {
    const rows = await fetchAll<{ id: string; name: string; programId: string | null; templateId: string | null; startedAt: string; status: string }>(
      this.db,
      'sessions',
      this.userId,
      (q) => q.eq('data->>status', 'completed'),
      'id, name:data->>name, programId:data->>programId, templateId:data->>templateId, startedAt:data->>startedAt, status:data->>status',
    );
    return rows.map((r) => ({ ...r, status: 'completed' as const }));
  }

  async histories(exerciseIds: string[]) {
    if (!exerciseIds.length) return new Map();
    const sets = await fetchAll<SetEntry>(this.db, 'sets', this.userId, (q) => q.in('data->>exerciseId', exerciseIds));
    const sessionIds = [...new Set(sets.map((s) => s.sessionId))];
    const sessions: WorkoutSession[] = [];
    for (let i = 0; i < sessionIds.length; i += 200) {
      const chunk = sessionIds.slice(i, i + 200);
      sessions.push(...(await fetchAll<WorkoutSession>(this.db, 'sessions', this.userId, (q) => q.in('id', chunk))));
    }
    return buildHistories(exerciseIds, sessions, sets);
  }

  async plan(now: Date, tz: string, templateId: string | null, force: boolean) {
    const [settings, programs, templates, completed] = await Promise.all([
      this.settings(),
      fetchAll<Program>(this.db, 'programs', this.userId),
      fetchAll<WorkoutTemplate>(this.db, 'templates', this.userId),
      this.completedSessions(),
    ]);
    return planToday({ settings, programs, templates, completed, now, tz, templateId, force });
  }

  async insertSession(session: WorkoutSession) {
    const { error } = await this.db.from('sessions').insert({ user_id: this.userId, id: session.id, data: session, deleted: false });
    if (error) throw new Error(`sessions: ${error.message}`);
  }

  async insertSet(set: SetEntry) {
    const { error } = await this.db.from('sets').insert({ user_id: this.userId, id: set.id, data: set, deleted: false });
    if (error) throw new Error(`sets: ${error.message}`);
  }

  /** Minimal update: re-read the stored row and only change status/endedAt. */
  async completeSession(sessionId: string, now: Date): Promise<WorkoutSession> {
    const { data, error } = await this.db
      .from('sessions')
      .select('data')
      .eq('user_id', this.userId)
      .eq('id', sessionId)
      .single();
    if (error) throw new Error(`sessions: ${error.message}`);
    const updated = finishSession(data.data as WorkoutSession, now);
    const { error: e2 } = await this.db
      .from('sessions')
      .update({ data: updated })
      .eq('user_id', this.userId)
      .eq('id', sessionId);
    if (e2) throw new Error(`sessions: ${e2.message}`);
    return updated;
  }
}

async function readParams(req: Request, url: URL): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  delete params.key;
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.trim()) {
      const type = req.headers.get('content-type') ?? '';
      if (type.includes('application/x-www-form-urlencoded')) {
        Object.assign(params, Object.fromEntries(new URLSearchParams(text).entries()));
      } else {
        try {
          const body = JSON.parse(text);
          if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(params, body);
          else throw new Error();
        } catch {
          throw new ApiError(400, 'Ogiltig JSON i förfrågan. Skicka t.ex. {"reps": 8, "weight": 82.5}.');
        }
      }
    }
  }
  return params;
}

async function handle(action: Action, user: UserData, params: Record<string, unknown>, now: Date): Promise<Response> {
  const tzParam = typeof params.tz === 'string' ? params.tz : 'Europe/Stockholm';
  const tz = isValidTimeZone(tzParam) ? tzParam : 'Europe/Stockholm';
  const templateId = typeof params.templateId === 'string' && params.templateId.trim() ? params.templateId.trim() : null;

  switch (action) {
    case 'next':
    case 'start': {
      let session = await user.activeSession();
      const settings = await user.settings();
      if (!session) {
        const wantsStart = action === 'start' || truthy(params.start);
        const plan = await user.plan(now, tz, templateId, truthy(params.force));
        if (!wantsStart || plan.kind !== 'train') {
          const text =
            plan.kind === 'train'
              ? `Inget pågående pass. ${plan.text}. Lägg till start=1 för att starta passet.`
              : plan.text;
          return json({ done: false, started: false, sessionId: null, unit: settings.unit, status: plan.kind, text });
        }
        const exercises = await user.exercises();
        const histories = await user.histories([...new Set(plan.template.exercises.map((e) => e.exerciseId))]);
        session = startSession({
          id: crypto.randomUUID(),
          newId: () => crypto.randomUUID(),
          template: plan.template,
          program: plan.program,
          exercises,
          histories,
          settings,
          now,
        });
        await user.insertSession(session);
        const next = describeNext(session, [], exercises, settings);
        return json({ ...next, started: true, text: `Startade ${session.name}. ${next.text}` });
      }
      const [sets, exercises] = await Promise.all([user.sessionSets(session.id), user.exercises()]);
      return json({ ...describeNext(session, sets, exercises, settings), started: false });
    }

    case 'log': {
      const input = parseLogInput(params);
      const session = await user.activeSession();
      if (!session) throw new ApiError(409, 'Inget pågående pass. Starta passet först med "Nästa set".');
      const [settings, sets, exercises] = await Promise.all([user.settings(), user.sessionSets(session.id), user.exercises()]);
      const target = targetSet(session, sets, input.sessionExerciseId, exercises, settings);
      const entry = makeSetEntry({
        id: crypto.randomUUID(),
        session,
        sets,
        target,
        input,
        exercise: exercises.get(target.exerciseId),
        unit: settings.unit,
        now,
      });
      await user.insertSet(entry);
      return json(describeLogged(entry, session, [...sets, entry], exercises, settings, target.restSec));
    }

    case 'finish': {
      const session = await user.activeSession();
      if (!session) throw new ApiError(409, 'Inget pågående pass att avsluta.');
      const [settings, sets] = await Promise.all([user.settings(), user.sessionSets(session.id)]);
      const done = await user.completeSession(session.id, now);
      return json({ ...describeFinished(done, sets, settings, now), unit: settings.unit });
    }

    case 'today': {
      const [active, settings, exercises] = await Promise.all([user.activeSession(), user.settings(), user.exercises()]);
      const activeSets = active ? await user.sessionSets(active.id) : [];
      const plan = active ? null : await user.plan(now, tz, templateId, false);
      return json({ ...describeToday({ active, activeSets, plan, exercises, settings }), unit: settings.unit });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return errorResponse(405, 'Metoden stöds inte. Använd GET eller POST.');
  const url = new URL(req.url);
  const action = resolveAction(url);
  if (!action) return errorResponse(404, 'Okänd åtgärd. Använd next, start, log, finish eller today.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return errorResponse(500, 'Servern saknar Supabase-konfiguration.');
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const userId = await authenticate(db, req, url);
    const params = await readParams(req, url);
    return await handle(action, new UserData(db, userId), params, new Date());
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.status, e.message);
    console.error(e);
    return errorResponse(500, 'Något gick fel på servern. Försök igen.');
  }
});
