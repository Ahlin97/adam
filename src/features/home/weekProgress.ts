// Weekly goal on the home page: planned training days from the active program vs. passes done.
import type { Program, WorkoutSession } from '@/engine';

export interface WeekProgress {
  /** Monday 00:00 of the current week. */
  weekStart: Date;
  /** Per weekday (0 = Monday): planned by the program / trained (any completed pass). */
  planned: boolean[];
  trained: boolean[];
  done: number;
  /** Passes per week the program asks for; null without a program. */
  goal: number | null;
  /** Full weeks in a row (before this one, plus this one once reached) where the goal was met. */
  streak: number;
}

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function plannedDays(program: Program | undefined): boolean[] {
  if (!program) return [false, false, false, false, false, false, false];
  if (program.mode === 'weekdays') return program.weekdays.map(Boolean);
  return program.reminderDays.some(Boolean) ? program.reminderDays.map(Boolean) : [false, false, false, false, false, false, false];
}

export function weekProgress(program: Program | undefined, completed: Pick<WorkoutSession, 'startedAt'>[], today: Date): WeekProgress {
  const weekStart = mondayOf(today);
  const planned = plannedDays(program);
  const goalDays = planned.filter(Boolean).length;
  const goal = program && goalDays > 0 ? goalDays : null;

  // Count passes per week (keyed by Monday) and which weekdays of this week were trained.
  const perWeek = new Map<number, number>();
  const trained = [false, false, false, false, false, false, false];
  for (const s of completed) {
    const d = new Date(s.startedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = mondayOf(d).getTime();
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    if (key === weekStart.getTime()) trained[(d.getDay() + 6) % 7] = true;
  }
  const done = perWeek.get(weekStart.getTime()) ?? 0;

  let streak = 0;
  if (goal) {
    if (done >= goal) streak++;
    const w = new Date(weekStart);
    for (let i = 0; i < 104; i++) {
      w.setDate(w.getDate() - 7);
      if ((perWeek.get(w.getTime()) ?? 0) >= goal) streak++;
      else break;
    }
  }
  return { weekStart, planned, trained, done, goal, streak };
}
