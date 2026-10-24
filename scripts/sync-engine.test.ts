// Fails when supabase/functions/_shared/engine is out of date. Fix with `npm run engine:sync`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error – plain .mjs script without type declarations
import { DEST_DIR, HEADER, SRC_DIR, engineFiles } from './sync-engine.mjs';

describe('engine copy for Supabase Edge Functions', () => {
  it('exists', () => {
    expect(existsSync(DEST_DIR), 'run `npm run engine:sync`').toBe(true);
  });

  it('has exactly the engine source files', () => {
    const expected: string[] = engineFiles();
    const actual = readdirSync(DEST_DIR as string).sort();
    expect(actual, 'run `npm run engine:sync`').toEqual(expected);
  });

  it('every file matches src/engine (ignoring the header)', () => {
    for (const f of engineFiles() as string[]) {
      const src = readFileSync(join(SRC_DIR, f), 'utf8');
      const copy = readFileSync(join(DEST_DIR, f), 'utf8');
      expect(copy.startsWith(HEADER), `${f}: missing GENERATED header`).toBe(true);
      expect(copy.slice((HEADER as string).length), `${f} is out of date – run \`npm run engine:sync\``).toBe(src);
    }
  });
});
