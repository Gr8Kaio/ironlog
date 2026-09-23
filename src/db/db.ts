import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMetric,
  DayIntakeOverride,
  Exercise,
  Food,
  FoodLog,
  PersonalRecord,
  Routine,
  RoutineDay,
  RoutineExercise,
  Run,
  RunInterval,
  Settings,
  WaterLog,
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
  foods!: EntityTable<Food, 'id'>;
  foodLogs!: EntityTable<FoodLog, 'id'>;
  waterLogs!: EntityTable<WaterLog, 'id'>;
  dayOverrides!: EntityTable<DayIntakeOverride, 'localDate'>;
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

    // v2 adds the fuel log. Declaring only the new stores leaves every v1
    // table, and its data, exactly as it was.
    this.version(2).stores({
      foods: 'id, name, lastUsedAt, useCount',
      foodLogs: 'id, localDate, loggedAt, foodId, [localDate+meal]',
    });

    // v3 adds the water log. Same rule as v2: only the new store is declared,
    // so every existing table and its rows are untouched.
    this.version(3).stores({
      waterLogs: 'id, localDate, loggedAt',
    });

    // v4 adds the manual say over what an unlogged day counts as. Keyed by the
    // day itself rather than by an id: there is only ever one ruling per day,
    // so writing it twice is an update and never a duplicate.
    this.version(4).stores({
      dayOverrides: 'localDate',
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
  kcalTarget: null,
  proteinTargetG: null,
  carbsTargetG: null,
  fatTargetG: null,
  weeklyBudgetEnabled: true,
  // Above target on purpose. A day you did not log is usually a day you were
  // not counting, and those run high; assuming the target would quietly make
  // every gap in the log look like a day that went to plan.
  assumedDayKcal: 2900,
  // Argentine-shaped by default: a real merienda, a late and substantial cena.
  mealSplit: { breakfast: 0.2, lunch: 0.35, snack: 0.15, dinner: 0.3 },
  waterTargetMl: 2500,
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
