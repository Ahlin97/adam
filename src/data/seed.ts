// Seeds the builtin exercise library and starter programs on first run (and adds new builtins later).
import { db } from '@/db/db';
import { putMany } from '@/db/repo';
import { BUILTIN_EXERCISES } from './exercises';
import { starterPack } from './programs';

const STARTER_KEY = 'seededStarter';

let running: Promise<void> | null = null;

/** Idempotent: safe to call on every startup. Never overwrites existing rows (incl. soft-deleted). */
export function ensureSeeded(): Promise<void> {
  running ??= seed().finally(() => {
    running = null;
  });
  return running;
}

async function seed(): Promise<void> {
  // Builtin exercises: only add ids that don't exist locally at all (deleted rows count as existing).
  const existing = new Set(await db.exercises.toCollection().primaryKeys());
  const missing = BUILTIN_EXERCISES.filter((e) => !existing.has(e.id));
  if (missing.length) await putMany('exercises', missing);

  // Starter templates/programs: once per local database, and only if the user has no templates.
  const meta = await db.meta.get(STARTER_KEY);
  if (meta?.value) return;
  if ((await db.templates.count()) === 0) {
    const { templates, programs } = starterPack();
    const existingPrograms = new Set(await db.programs.toCollection().primaryKeys());
    await putMany('templates', templates);
    await putMany(
      'programs',
      programs.filter((p) => !existingPrograms.has(p.id)),
    );
  }
  await db.meta.put({ key: STARTER_KEY, value: true });
}
