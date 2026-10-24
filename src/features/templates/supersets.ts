import type { TemplateExercise } from '@/engine';

/**
 * Normalise superset groups: a group must be one contiguous run of ≥ 2 exercises.
 * Later runs of a repeated group id get a fresh id; runs of length 1 are ungrouped.
 */
export function normalizeSupersets<T extends Pick<TemplateExercise, 'supersetGroup'>>(list: T[], newId: () => string): T[] {
  const out = list.map((e) => ({ ...e }));
  const seen = new Set<string>();
  let i = 0;
  while (i < out.length) {
    const g = out[i].supersetGroup;
    if (!g) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1].supersetGroup === g) j++;
    const len = j - i + 1;
    const id = len < 2 ? null : seen.has(g) ? newId() : g;
    if (id) seen.add(id);
    for (let k = i; k <= j; k++) out[k].supersetGroup = id;
    i = j + 1;
  }
  return out;
}

/** Labels like "A1", "A2" for superset members, null for standalone exercises. */
export function supersetLabels(list: Pick<TemplateExercise, 'supersetGroup'>[]): (string | null)[] {
  const letters: Map<string, string> = new Map();
  const counts: Map<string, number> = new Map();
  return list.map((e) => {
    const g = e.supersetGroup;
    if (!g) return null;
    if (!letters.has(g)) letters.set(g, String.fromCharCode(65 + (letters.size % 26)));
    const n = (counts.get(g) ?? 0) + 1;
    counts.set(g, n);
    return `${letters.get(g)}${n}`;
  });
}
