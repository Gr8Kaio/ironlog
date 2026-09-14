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
  /**
   * Your bodyweight at the time, in kg, and only on sets of a bodyweight
   * exercise. Present-but-zero still marks the set as bodyweight, which is
   * what makes `weightKg: 0` read as `Bodyweight` instead of as no load.
   */
  bodyWeightKg?: number | null;
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

// ------------------------------------------------------------------- fuel

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** `unit` is for things counted rather than weighed: an egg, a can, a slice. */
export const FOOD_UNITS = ['g', 'ml', 'unit'] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

/** A named shortcut for an amount, in the food's own `refUnit`. */
export interface Portion {
  label: string;
  amount: number;
}

/**
 * An entry in your personal food library.
 *
 * Macros are stored against `refAmount` of `refUnit` rather than always per
 * 100 g, so "1 huevo" and "100 g de arroz" are the same shape with no special
 * case. Everything else multiplies by `amount / refAmount`.
 */
export interface Food {
  id: string;
  name: string;
  brand?: string;
  refAmount: number;
  refUnit: FoodUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  portions: Portion[];
  /** Where the numbers came from, so any value can be audited later. */
  source?: string;
  /**
   * Set on rows that came from the shipped library. It is what lets a later
   * release add foods to an install that already has some: seeding matches on
   * this, so new entries arrive and edited ones are never overwritten.
   */
  seedSlug?: string;
  isFavorite: boolean;
  isArchived: boolean;
  /** Drives the "recent" ordering in the quick-add sheet. */
  lastUsedAt?: number | null;
  useCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One thing eaten, once.
 *
 * The macros are copied in rather than read back through `foodId`: correcting
 * a food's values later must not silently rewrite what you already ate. Same
 * reasoning as the bodyweight snapshot on a set.
 */
export interface FoodLog {
  id: string;
  localDate: string;
  loggedAt: number;
  foodId?: string | null;
  name: string;
  amount: number;
  unit: FoodUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  meal: MealSlot;
  /**
   * A meal you eyeballed instead of weighed — someone else's kitchen, a
   * restaurant. Kept so the weekly view can say how much of the total is
   * estimated, which is honest in a way that either faking precision or
   * skipping the entry is not.
   */
  estimated: boolean;
  note?: string;
}

/**
 * One drink, logged. Volume only: there is nothing else worth storing, and a
 * counter you can undo beats a number you have to retype.
 */
export interface WaterLog {
  id: string;
  localDate: string;
  loggedAt: number;
  ml: number;
  /** What it was, when it was not plain water. Mate counts; it is still fluid. */
  label?: string;
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

  /** Daily targets. Null means "not set yet" and hides the rings. */
  kcalTarget?: number | null;
  proteinTargetG?: number | null;
  carbsTargetG?: number | null;
  fatTargetG?: number | null;
  /**
   * Read the day against a rolling weekly budget instead of a hard daily cap.
   * Fat responds to the weekly balance, so one big Sunday lunch is a budgeting
   * question, not a failed day.
   */
  weeklyBudgetEnabled: boolean;
  /**
   * Share of the day's energy each meal is planned to carry. Configurable
   * because meal shapes are personal: a 20/35/15/30 day and an 8/45/12/35 day
   * are both normal, and a split that does not match how you actually eat
   * produces targets you ignore.
   */
  mealSplit: Record<MealSlot, number>;
  /** Daily fluid goal in millilitres. Null hides the tracker entirely. */
  waterTargetMl?: number | null;
}
