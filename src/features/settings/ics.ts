// iCalendar (RFC 5545) generator for training-day reminders. Web apps cannot reliably schedule
// local notifications without a push server, so we hand the user a calendar file with weekly
// recurring events and an alarm instead.
import type { Program, WorkoutTemplate } from '@/engine/types.ts';

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Escape TEXT values (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (UTF-8) with CRLF + space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (curLen + len > limit) {
      parts.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (d: Date, hh: number, mm: number) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Training weekdays (0 = måndag) with the template scheduled that day (null in rotation mode). */
export function trainingDays(program: Program): { day: number; templateId: string | null }[] {
  const out: { day: number; templateId: string | null }[] = [];
  for (let d = 0; d < 7; d++) {
    if (program.mode === 'weekdays') {
      const t = program.weekdays[d];
      if (t) out.push({ day: d, templateId: t });
    } else if (program.reminderDays[d]) {
      out.push({ day: d, templateId: null });
    }
  }
  return out;
}

export interface ReminderIcsOptions {
  program: Program;
  templates: Pick<WorkoutTemplate, 'id' | 'name'>[];
  /** "HH:MM" local time. */
  time: string;
  now: Date;
  durationMin?: number;
}

/**
 * Build a VCALENDAR with one weekly recurring VEVENT per training day (floating local time,
 * so it follows the phone's time zone) and a VALARM at the start time.
 * Returns null when the program has no training days.
 */
export function buildReminderIcs({ program, templates, time, now, durationMin = 60 }: ReminderIcsOptions): string | null {
  const days = trainingDays(program);
  if (!days.length) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  const hh = m ? Math.min(23, +m[1]) : 17;
  const mm = m ? Math.min(59, +m[2]) : 0;
  const names = new Map(templates.map((t) => [t.id, t.name]));
  const todayIdx = (now.getDay() + 6) % 7;

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gymlogg//Påminnelser//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(`Träning – ${program.name}`)}`];
  for (const { day, templateId } of days) {
    const offset = (day - todayIdx + 7) % 7;
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const endTotal = hh * 60 + mm + durationMin;
    const endH = Math.min(23, Math.floor(endTotal / 60));
    const endM = endTotal >= 24 * 60 ? 59 : endTotal % 60;
    const tName = templateId ? names.get(templateId) : null;
    const summary = tName ? `Träning: ${tName}` : `Träning – ${program.name}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:gymlogg-${program.id}-${BYDAY[day]}@gymlogg`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(first, hh, mm)}`,
      `DTEND:${localStamp(first, endH, endM)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[day]}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(`Dags att träna${tName ? ` – ${tName}` : ''}. Program: ${program.name}.`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
