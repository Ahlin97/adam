// Pure logic behind "Planera veckan": pick training days and a split, get a program back.
import type { Program } from '@/engine';
import { newId } from '@/db/repo';
import { WEEKDAY_SHORT } from '@/lib/labels';

export interface Split {
  key: string;
  name: string;
  blurb: string;
  /** Starter templates, in the order they are trained. */
  templates: string[];
  /** Days per week the split is built for. */
  fits: number[];
}

export const SPLITS: Split[] = [
  {
    key: 'fullbody',
    name: 'Helkropp',
    blurb: 'Hela kroppen varje pass, A och B växlar. Bäst för 2–3 dagar.',
    templates: ['st-fullbody-a', 'st-fullbody-b'],
    fits: [2, 3],
  },
  {
    key: '5x5',
    name: '5 × 5 styrka',
    blurb: 'Få, tunga basövningar och linjär progression. 3 dagar.',
    templates: ['st-5x5-a', 'st-5x5-b'],
    fits: [3],
  },
  {
    key: 'upperlower',
    name: 'Överkropp/underkropp',
    blurb: 'Två överkropps- och två benpass. Bäst för 4 dagar.',
    templates: ['st-upper-a', 'st-lower-a', 'st-upper-b', 'st-lower-b'],
    fits: [4],
  },
  {
    key: 'ppl',
    name: 'Push/Pull/Ben',
    blurb: 'Press, drag och ben i tur och ordning. 3, 5 eller 6 dagar.',
    templates: ['st-push', 'st-pull', 'st-legs'],
    fits: [3, 5, 6],
  },
];

/** The split that suits this many training days best. */
export function recommendSplit(dayCount: number, available: Split[] = SPLITS): Split | null {
  const fallback = dayCount <= 3 ? 'fullbody' : dayCount === 4 ? 'upperlower' : 'ppl';
  return available.find((s) => s.fits.includes(dayCount)) ?? available.find((s) => s.key === fallback) ?? available[0] ?? null;
}

/** Spread templates over the chosen weekdays (0 = Monday) in order, repeating as needed. */
export function spreadOverWeek(days: number[], templates: string[]): (string | null)[] {
  const week: (string | null)[] = [null, null, null, null, null, null, null];
  if (!templates.length) return week;
  [...days].sort((a, b) => a - b).forEach((d, k) => (week[d] = templates[k % templates.length]));
  return week;
}

export const daysOf = (week: (string | null)[]): number[] => week.flatMap((t, i) => (t ? [i] : []));

/**
 * Turn a plan into a program. A split that does not divide evenly into the week (e.g. Helkropp A/B
 * three days a week) becomes a rotation so A and B keep alternating across weeks; otherwise, or when
 * days were edited by hand, the passes are pinned to weekdays.
 */
export function buildProgram(plan: { name: string; days: number[]; templates: string[]; custom: (string | null)[] | null }, id = newId()): Program {
  const reminderDays = [0, 1, 2, 3, 4, 5, 6].map((d) => plan.days.includes(d));
  const base = { id, name: plan.name.trim() || 'Min vecka', reminderDays, rotation: [] as string[] };
  if (plan.custom) return { ...base, mode: 'weekdays', weekdays: plan.custom, reminderDays: plan.custom.map(Boolean) };
  if (plan.templates.length && plan.days.length % plan.templates.length !== 0) {
    return { ...base, mode: 'rotation', rotation: plan.templates, weekdays: [null, null, null, null, null, null, null] };
  }
  return { ...base, mode: 'weekdays', weekdays: spreadOverWeek(plan.days, plan.templates) };
}

export function defaultName(splitName: string | null, dayCount: number): string {
  return `${splitName ?? 'Egna pass'} · ${dayCount} ${dayCount === 1 ? 'dag' : 'dagar'}/vecka`;
}

export const dayList = (days: number[]) => [...days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(', ');
