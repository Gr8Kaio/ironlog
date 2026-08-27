import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMetric,
  Exercise,
  PersonalRecord,
  Routine,
  RoutineDay,
  RoutineExercise,
  Run,
  RunInterval,
  Settings,
  Workout,
  WorkoutSet,
} from './types';

/**
 * Booleans are deliberately absent from every index below: IndexedDB cannot
 * index a boolean key, so `isArchived` / `isActive` are filtered in memory.
 * At single-user volumes that costs nothing.
 */
export class IronLogDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  routines!: EntityTable<Routine, 'id'>;
  routineDays!: EntityTable<RoutineDay, 'id'>;
  routineExercises!: EntityTable<RoutineExercise, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  personalRecords!: EntityTable<PersonalRecord, 'id'>;
  runs!: EntityTable<Run, 'id'>;
  runIntervals!: EntityTable<RunInterval, 'id'>;
  bodyMetrics!: EntityTable<BodyMetric, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('ironlog');
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, equipment',
      routines: 'id, name',
      routineDays: 'id, routineId, [routineId+position]',
      routineExercises: 'id, routineDayId, exerciseId, [routineDayId+position]',
      workouts: 'id, startedAt, localDate, status, routineDayId',
      sets: 'id, workoutId, exerciseId, completedAt, [exerciseId+completedAt], [workoutId+exerciseId]',
      personalRecords: 'id, exerciseId, workoutId, [exerciseId+prType]',
      runs: 'id, startedAt, localDate, runType',
      runIntervals: 'id, runId, [runId+repNumber]',
      bodyMetrics: 'id, measuredAt, localDate',
      settings: 'id',
    });
  }
}

export const db = new IronLogDB();

export const newId = (): string => crypto.randomUUID();

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  barWeightKg: 20,
  plateInventory: [
    { weightKg: 25, pairs: 2 },
    { weightKg: 20, pairs: 2 },
    { weightKg: 15, pairs: 2 },
    { weightKg: 10, pairs: 2 },
    { weightKg: 5, pairs: 2 },
    { weightKg: 2.5, pairs: 2 },
    { weightKg: 1.25, pairs: 2 },
  ],
  defaultRestSec: 150,
  defaultSurface: 'road',
  lastBackupAt: null,
  backupNagDays: 14,
  soundOnRestEnd: true,
};

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get('settings');
  if (stored) return { ...DEFAULT_SETTINGS, ...stored };
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'settings' });
}
