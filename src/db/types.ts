/**
 * Domain types. No TS enums anywhere: `erasableSyntaxOnly` is on, so every
 * closed set is a `const` object plus a union derived from it. The const
 * doubles as the list the UI iterates to build pickers.
 */

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const SET_TYPES = ['warmup', 'working', 'amrap', 'dropset'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const PR_TYPES = ['weight', 'e1rm', 'volume'] as const;
export type PrType = (typeof PR_TYPES)[number];

export const RUN_TYPES = ['easy', 'tempo', 'intervals', 'long', 'race'] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const SURFACES = ['road', 'trail', 'treadmill'] as const;
export type Surface = (typeof SURFACES)[number];

export const KNEE_STATES = ['fine', 'niggle', 'sore', 'bad'] as const;
export type KneeState = (typeof KNEE_STATES)[number];

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  /** Smallest step this exercise can actually be loaded by. Drives the steppers. */
  incrementKg: number;
  isCustom: boolean;
  isArchived: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Routine {
  id: string;
  name: string;
  isActive: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineDay {
  id: string;
  routineId: string;
  name: string;
  position: number;
}

export interface RoutineExercise {
  id: string;
  routineDayId: string;
  exerciseId: string;
  position: number;
  /** Consecutive entries sharing a letter render as one superset block. */
  supersetGroup?: string | null;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRpe?: number | null;
  restSeconds: number;
  notes?: string;
}

export type WorkoutStatus = 'in_progress' | 'completed';

export interface Workout {
  id: string;
  routineId?: string | null;
  routineDayId?: string | null;
  name: string;
  startedAt: number;
  /** The calendar day *you* were in, `YYYY-MM-DD`. All grouping buckets on this. */
  localDate: string;
  finishedAt?: number | null;
  status: WorkoutStatus;
  bodyWeightKg?: number | null;
  notes?: string;
  /**
   * Exercises chosen for this session beyond its routine day. Persisted rather
   * than held in component state so an exercise added mid-session survives a
   * reload before its first set, and so a session can be repeated exactly.
   */
  plannedExerciseIds?: string[];
}

export interface WorkoutSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe?: number | null;
  setType: SetType;
  note?: string;
  completedAt: number;
  /** Denormalised badge source; rebuilt wholesale after an import. */
  prTypes: PrType[];
}

export interface PersonalRecord {
  id: string;
  exerciseId: string;
  workoutId: string;
  setId: string;
  prType: PrType;
  value: number;
  achievedAt: number;
}

export interface Run {
  id: string;
  startedAt: number;
  localDate: string;
  /** Session totals, warmup and cooldown included. Pace is never stored. */
  distanceKm: number;
  durationSec: number;
  runType: RunType;
  route?: string;
  notes?: string;
  effort?: number | null;
  kneeFeel?: KneeState | null;
  surface?: Surface | null;
  tempC?: number | null;
  weather?: string;
}

export interface RunInterval {
  id: string;
  runId: string;
  repNumber: number;
  distanceM: number;
  durationSec: number;
  restSec?: number | null;
  note?: string;
}

export interface BodyMetric {
  id: string;
  measuredAt: number;
  localDate: string;
  weightKg?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  hipCm?: number | null;
  notes?: string;
}

export interface PlateStock {
  weightKg: number;
  /** Pairs available, since plates load symmetrically. */
  pairs: number;
}

export interface Settings {
  id: 'settings';
  barWeightKg: number;
  plateInventory: PlateStock[];
  defaultRestSec: number;
  defaultSurface: Surface;
  /** Epoch ms of the last successful JSON export. Drives the backup nag. */
  lastBackupAt?: number | null;
  backupNagDays: number;
  soundOnRestEnd: boolean;
}
