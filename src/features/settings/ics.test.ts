import { describe, expect, it } from 'vitest';
import type { Program } from '@/engine/types.ts';
import { buildReminderIcs, escapeText, foldLine, trainingDays } from './ics';

const weekdays: Program = {
  id: 'p1',
  name: 'Push/Pull/Ben',
  mode: 'weekdays',
  weekdays: ['push', null, 'pull', null, 'legs', null, null],
  rotation: [],
  reminderDays: [false, false, false, false, false, false, false],
};
const templates = [
  { id: 'push', name: 'Push' },
  { id: 'pull', name: 'Pull, tung' },
  { id: 'legs', name: 'Ben' },
];
const now = new Date(2026, 9, 24, 12); // Saturday 24 Oct 2026

describe('ics', () => {
  it('lists training days', () => {
    expect(trainingDays(weekdays).map((d) => d.day)).toEqual([0, 2, 4]);
    const rot: Program = { ...weekdays, mode: 'rotation', reminderDays: [true, false, false, true, false, false, false] };
    expect(trainingDays(rot)).toEqual([
      { day: 0, templateId: null },
      { day: 3, templateId: null },
    ]);
  });

  it('builds weekly recurring events with alarms', () => {
    const ics = buildReminderIcs({ program: weekdays, templates, time: '17:30', now })!;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
    // First Monday after Saturday 24 Oct is 26 Oct.
    expect(ics).toContain('DTSTART:20261026T173000');
    expect(ics).toContain('DTEND:20261026T183000');
    expect(ics).toContain('SUMMARY:Träning: Pull\\, tung');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('returns null without training days', () => {
    expect(buildReminderIcs({ program: { ...weekdays, weekdays: Array(7).fill(null) }, templates, time: '17:00', now })).toBeNull();
  });

  it('escapes and folds', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const long = 'DESCRIPTION:' + 'å'.repeat(80);
    const folded = foldLine(long);
    expect(folded.split('\r\n ').join('')).toBe(long);
    expect(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
