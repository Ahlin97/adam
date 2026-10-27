// Seeds the builtin exercise library on first run (and adds new builtins later).
// The app no longer ships ready-made passes or programs: everyone builds their own.
import { db } from '@/db/db';
import { putMany, removeStarterContent } from '@/db/repo';
import { BUILTIN_EXERCISES } from './exercises';

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
  // Earlier versions seeded starter passes/programs ("st-…"); remove them from existing accounts.
  await removeStarterContent();
}
