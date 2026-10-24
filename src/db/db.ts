import Dexie, { type Table } from 'dexie';
import type { Exercise, Program, SetEntry, Settings, WorkoutSession, WorkoutTemplate } from '@/engine';

/** Local bookkeeping fields added to every synced row. */
export interface SyncFields {
  /** 1 = changed locally and not yet pushed to Supabase. */
  _dirty: 0 | 1;
  /** 1 = soft deleted (kept so the deletion can be synced). */
  _deleted: 0 | 1;
}

export type Row<T> = T & SyncFields;

export interface MetaRow {
  key: string;
  value: unknown;
}

export class GymDB extends Dexie {
  exercises!: Table<Row<Exercise>, string>;
  templates!: Table<Row<WorkoutTemplate>, string>;
  programs!: Table<Row<Program>, string>;
  sessions!: Table<Row<WorkoutSession>, string>;
  sets!: Table<Row<SetEntry>, string>;
  settings!: Table<Row<Settings>, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'gymlogg') {
    super(name);
    this.version(1).stores({
      exercises: 'id, _dirty, name, primaryMuscle, equipment, isFavorite',
      templates: 'id, _dirty',
      programs: 'id, _dirty',
      sessions: 'id, _dirty, status, startedAt',
      sets: 'id, _dirty, sessionId, exerciseId, completedAt',
      settings: 'id, _dirty',
      meta: 'key',
    });
  }
}

export const SYNCED_TABLES = ['exercises', 'templates', 'programs', 'sessions', 'sets', 'settings'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const db = new GymDB();
