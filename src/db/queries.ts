import { db } from './db';
import type {
  DayIntakeMode,
  DayIntakeOverride,
  Exercise,
  Food,
  FoodLog,
  MuscleGroup,
  PrType,
  Run,
  RunInterval,
  RunType,
  WaterLog,
  Workout,
  WorkoutSet,
} from './types';
import { bestE1RM, epley1RM, isWorkingSet, setLoad, setVolume, topSet, workoutVolume } from '../lib/calc';
import { addDaysToLocalDate, localDateOf, monthKey, recentWeeks, todayLocalDate, weekStart } from '../lib/dates';
import type { TrainingSession } from '../lib/trainingFuel';

// ------------------------------------------------------------ history feed

export interface WorkoutEntry {
  kind: 'workout';
  id: string;
  startedAt: number;
  localDate: string;
  workout: Workout;
  sets: WorkoutSet[];
  volumeKg: number;
  workingSets: number;
  exerciseCount: number;
  prCount: number;
  durationSec: number | null;
}

export interface RunEntry {
  kind: 'run';
  id: string;
  startedAt: number;
  localDate: string;
  run: Run;
  intervals: RunInterval[];
}

export type HistoryEntry = WorkoutEntry | RunEntry;

/**
 * The single merge point for the unified history. Workouts and runs live in
 * separate stores; every screen that shows what the week looked like reads
 * through here, so the merge exists in exactly one place.
 */
export async function getHistory(limit = 100): Promise<HistoryEntry[]> {
  const [allWorkouts, runs] = await Promise.all([
    db.workouts.orderBy('startedAt').reverse().limit(limit).toArray(),
    db.runs.orderBy('startedAt').reverse().limit(limit).toArray(),
  ]);

  // An unfinished session belongs in the dock, not in history: reviewing it
  // would offer to repeat a session that is still being logged.
  const workouts = allWorkouts.filter((w) => w.status === 'completed');

  const [sets, intervals] = await Promise.all([
    db.sets.where('workoutId').anyOf(workouts.map((w) => w.id)).toArray(),
    db.runIntervals.where('runId').anyOf(runs.map((r) => r.id)).toArray(),
  ]);

  const setsBy = groupBy(sets, (s) => s.workoutId);
  const intervalsBy = groupBy(intervals, (i) => i.runId);

  const entries: HistoryEntry[] = [
    ...workouts.map((w) => toWorkoutEntry(w, setsBy.get(w.id) ?? [])),
    ...runs.map<RunEntry>((r) => ({
      kind: 'run',
      id: r.id,
      startedAt: r.startedAt,
      localDate: r.localDate,
      run: r,
      intervals: (intervalsBy.get(r.id) ?? []).sort((a, b) => a.repNumber - b.repNumber),
    })),
  ];

  return entries.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export function toWorkoutEntry(workout: Workout, sets: WorkoutSet[]): WorkoutEntry {
  const ordered = [...sets].sort((a, b) => a.completedAt - b.completedAt);
  return {
    kind: 'workout',
    id: workout.id,
    startedAt: workout.startedAt,
    localDate: workout.localDate,
    workout,
    sets: ordered,
    volumeKg: workoutVolume(ordered),
    workingSets: ordered.filter(isWorkingSet).length,
    exerciseCount: new Set(ordered.map((s) => s.exerciseId)).size,
    prCount: ordered.reduce((t, s) => t + (s.prTypes?.length ?? 0), 0),
    durationSec: workout.finishedAt
      ? Math.round((workout.finishedAt - workout.startedAt) / 1000)
      : null,
  };
}

export async function getWorkoutEntry(workoutId: string): Promise<WorkoutEntry | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout) return null;
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
  return toWorkoutEntry(workout, sets);
}

// ------------------------------------------------------------ set prefill

export interface LastPerformance {
  workoutId: string;
  localDate: string;
  sets: WorkoutSet[];
}

/**
 * What you did last time for this exercise, used to prefill each set so only
 * the delta needs tapping. Looks for the most recent *other* session that
 * actually contains this exercise, not merely the most recent session.
 */
export async function getLastPerformance(
  exerciseId: string,
  excludeWorkoutId?: string,
): Promise<LastPerformance | null> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).reverse().sortBy('completedAt');
  const candidate = sets.find((s) => s.workoutId !== excludeWorkoutId);
  if (!candidate) return null;

  const workout = await db.workouts.get(candidate.workoutId);
  const sameSession = sets
    .filter((s) => s.workoutId === candidate.workoutId)
    .sort((a, b) => a.setNumber - b.setNumber);

  return {
    workoutId: candidate.workoutId,
    localDate: workout?.localDate ?? '',
    sets: sameSession,
  };
}

/**
 * The most recent weigh-in, in kg. This is what a bodyweight set is credited
 * with, so pull-ups stop counting as zero load.
 */
export async function getLatestBodyWeightKg(): Promise<number | null> {
  const metric = await db.bodyMetrics
    .orderBy('measuredAt')
    .reverse()
    .filter((m) => m.weightKg != null)
    .first();
  return metric?.weightKg ?? null;
}

// ------------------------------------------------------------ body progress

export interface BodyWeightPoint {
  localDate: string;
  weightKg: number;
}

export async function getBodyWeightTrend(): Promise<BodyWeightPoint[]> {
  const metrics = await db.bodyMetrics.orderBy('measuredAt').toArray();
  return metrics
    .filter((m) => m.weightKg != null)
    .map((m) => ({ localDate: m.localDate, weightKg: m.weightKg as number }));
}

// ------------------------------------------------------------ lift progress

export interface ExercisePoint {
  localDate: string;
  e1rm: number | null;
  topWeightKg: number;
  topReps: number;
  volumeKg: number;
}

export async function getExerciseProgress(exerciseId: string): Promise<ExercisePoint[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).sortBy('completedAt');
  const workouts = await db.workouts.bulkGet([...new Set(sets.map((s) => s.workoutId))]);
  const dateOf = new Map(workouts.filter(Boolean).map((w) => [w!.id, w!.localDate]));

  const bySession = groupBy(sets.filter(isWorkingSet), (s) => s.workoutId);
  const points: ExercisePoint[] = [];

  for (const [workoutId, group] of bySession) {
    const top = topSet(group);
    points.push({
      localDate: dateOf.get(workoutId) ?? '',
      e1rm: bestE1RM(group),
      topWeightKg: top ? setLoad(top) : 0,
      topReps: top?.reps ?? 0,
      volumeKg: group.reduce((t, s) => t + setVolume(setLoad(s), s.reps), 0),
    });
  }

  return points.filter((p) => p.localDate).sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export interface WeekLiftStats {
  week: string;
  sessions: number;
  volumeKg: number;
  setsByMuscle: Record<string, number>;
  totalSets: number;
}

export async function getWeeklyLiftStats(weeks = 8): Promise<WeekLiftStats[]> {
  const keys = recentWeeks(weeks);
  const earliest = keys[0];

  const workouts = (await db.workouts.toArray()).filter((w) => w.localDate >= earliest);
  const sets = await db.sets.where('workoutId').anyOf(workouts.map((w) => w.id)).toArray();
  const exercises = await db.exercises.toArray();
  const muscleOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]));
  const weekOf = new Map(workouts.map((w) => [w.id, weekStart(w.localDate)]));

  const byWeek = new Map<string, WeekLiftStats>(
    keys.map((k) => [k, { week: k, sessions: 0, volumeKg: 0, setsByMuscle: {}, totalSets: 0 }]),
  );

  for (const w of workouts) {
    const bucket = byWeek.get(weekOf.get(w.id) ?? '');
    if (bucket) bucket.sessions += 1;
  }
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    const bucket = byWeek.get(weekOf.get(s.workoutId) ?? '');
    if (!bucket) continue;
    const muscle = muscleOf.get(s.exerciseId) ?? 'other';
    bucket.setsByMuscle[muscle] = (bucket.setsByMuscle[muscle] ?? 0) + 1;
    bucket.totalSets += 1;
    bucket.volumeKg += setVolume(setLoad(s), s.reps);
  }

  return keys.map((k) => byWeek.get(k)!);
}

export async function getMuscleGroupSets(weeks = 1): Promise<Record<MuscleGroup, number>> {
  const stats = await getWeeklyLiftStats(weeks);
  const totals: Record<string, number> = {};
  for (const week of stats) {
    for (const [muscle, count] of Object.entries(week.setsByMuscle)) {
      totals[muscle] = (totals[muscle] ?? 0) + count;
    }
  }
  return totals as Record<MuscleGroup, number>;
}

// ------------------------------------------------------------ run progress

export interface WeekRunStats {
  week: string;
  distanceKm: number;
  runs: number;
  durationSec: number;
}

export async function getWeeklyRunStats(weeks = 8): Promise<WeekRunStats[]> {
  const keys = recentWeeks(weeks);
  const earliest = keys[0];
  const runs = (await db.runs.toArray()).filter((r) => r.localDate >= earliest);

  const byWeek = new Map(keys.map((k) => [k, { week: k, distanceKm: 0, runs: 0, durationSec: 0 }]));
  for (const r of runs) {
    const bucket = byWeek.get(weekStart(r.localDate));
    if (!bucket) continue;
    bucket.distanceKm += r.distanceKm;
    bucket.runs += 1;
    bucket.durationSec += r.durationSec;
  }
  return keys.map((k) => byWeek.get(k)!);
}

export interface PacePoint {
  localDate: string;
  runType: RunType;
  paceSecPerKm: number;
  distanceKm: number;
}

/**
 * One point per run, with the run type riding along so the chart can split
 * easy from tempo into separate series instead of averaging them into a line
 * that describes neither.
 */
export async function getPaceTrend(): Promise<PacePoint[]> {
  const runs = await db.runs.orderBy('startedAt').toArray();
  return runs
    .filter((r) => r.distanceKm > 0 && r.durationSec > 0)
    .map((r) => ({
      localDate: r.localDate,
      runType: r.runType,
      paceSecPerKm: r.durationSec / r.distanceKm,
      distanceKm: r.distanceKm,
    }));
}

export interface RunTotals {
  longestKm: number;
  longestDate: string | null;
  totalKm: number;
  runCount: number;
  byMonth: { month: string; distanceKm: number; runs: number }[];
}

export async function getRunTotals(): Promise<RunTotals> {
  const runs = await db.runs.orderBy('startedAt').toArray();
  const months = new Map<string, { month: string; distanceKm: number; runs: number }>();
  let longestKm = 0;
  let longestDate: string | null = null;

  for (const r of runs) {
    const key = monthKey(r.localDate);
    const bucket = months.get(key) ?? { month: key, distanceKm: 0, runs: 0 };
    bucket.distanceKm += r.distanceKm;
    bucket.runs += 1;
    months.set(key, bucket);
    if (r.distanceKm > longestKm) {
      longestKm = r.distanceKm;
      longestDate = r.localDate;
    }
  }

  return {
    longestKm,
    longestDate,
    totalKm: runs.reduce((t, r) => t + r.distanceKm, 0),
    runCount: runs.length,
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ------------------------------------------------------------ scheduling

export interface NextDayHint {
  routineId: string;
  routineName: string;
  dayId: string;
  dayName: string;
  position: number;
  lastDoneLocalDate: string | null;
}

/**
 * Next up is the day after the last routine day you actually completed,
 * wrapping around at the end. Falls back to day one when nothing is logged.
 */
export async function getNextScheduledDay(): Promise<NextDayHint | null> {
  const routines = await db.routines.toArray();
  const routine = routines.find((r) => r.isActive) ?? routines[0];
  if (!routine) return null;

  const days = (await db.routineDays.where('routineId').equals(routine.id).toArray()).sort(
    (a, b) => a.position - b.position,
  );
  if (days.length === 0) return null;

  const dayIds = new Set(days.map((d) => d.id));
  const recent = await db.workouts.orderBy('startedAt').reverse().limit(40).toArray();
  const last = recent.find(
    (w) => w.status === 'completed' && w.routineDayId && dayIds.has(w.routineDayId),
  );

  const lastIndex = last ? days.findIndex((d) => d.id === last.routineDayId) : -1;
  const next = days[(lastIndex + 1) % days.length];

  return {
    routineId: routine.id,
    routineName: routine.name,
    dayId: next.id,
    dayName: next.name,
    position: next.position,
    lastDoneLocalDate: last?.localDate ?? null,
  };
}

// ------------------------------------------------------------ misc helpers

// ---------------------------------------------------------------- records

export interface PersonalRecordRow {
  id: string;
  prType: PrType;
  /** kg for weight and e1rm, kg of session volume for volume. */
  value: number;
  achievedAt: number;
  localDate: string;
  exercise: Exercise;
  /** The set that holds the record. Absent only if that set was since deleted. */
  set: WorkoutSet | null;
  workoutId: string;
  workoutName: string;
}

/**
 * The whole record board in one read.
 *
 * `personalRecords` holds only what currently stands — one row per exercise
 * per type, rewritten wholesale by `recomputeExercisePrs` — so this is every
 * record you presently hold, not a log of every record ever set. Each row is
 * paired back with the set that holds it, because the number alone does not
 * say what it cost: the reps and the RPE are the record.
 */
export async function getPersonalRecords(): Promise<PersonalRecordRow[]> {
  const records = await db.personalRecords.toArray();
  if (records.length === 0) return [];

  const [exercises, sets, workouts] = await Promise.all([
    getExerciseMap(),
    db.sets.bulkGet(records.map((r) => r.setId)),
    db.workouts.bulkGet([...new Set(records.map((r) => r.workoutId))]),
  ]);
  const workoutById = new Map(
    workouts.filter((w): w is Workout => !!w).map((w) => [w.id, w]),
  );

  const rows: PersonalRecordRow[] = [];
  records.forEach((record, i) => {
    const exercise = exercises.get(record.exerciseId);
    if (!exercise) return;
    const workout = workoutById.get(record.workoutId) ?? null;
    rows.push({
      id: record.id,
      prType: record.prType,
      value: record.value,
      achievedAt: record.achievedAt,
      // The session's own calendar day, never a UTC slice of the epoch: a
      // 23:40 lift has to stay on the day you actually lifted it.
      localDate: workout?.localDate ?? localDateOf(record.achievedAt),
      exercise,
      set: sets[i] ?? null,
      workoutId: record.workoutId,
      workoutName: workout?.name ?? '',
    });
  });

  // Heaviest first. Comparing across types is meaningless, so every caller
  // filters to one type before showing the list.
  return rows.sort((a, b) => b.value - a.value);
}

export async function getExerciseMap(): Promise<Map<string, Exercise>> {
  const exercises = await db.exercises.toArray();
  return new Map(exercises.map((e) => [e.id, e]));
}

export async function getActiveWorkout(): Promise<Workout | null> {
  const open = await db.workouts.where('status').equals('in_progress').toArray();
  return open.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

export function bestSetOf(sets: WorkoutSet[]): { set: WorkoutSet | null; e1rm: number | null } {
  const best = topSet(sets);
  return { set: best, e1rm: best ? epley1RM(setLoad(best), best.reps) : null };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

// ------------------------------------------------------------------- fuel

export async function getLogsForDate(localDate: string): Promise<FoodLog[]> {
  const logs = await db.foodLogs.where('localDate').equals(localDate).toArray();
  return logs.sort((a, b) => a.loggedAt - b.loggedAt);
}

/** Every log in the Monday-based week containing `localDate`. */
export async function getLogsForWeekOf(localDate: string): Promise<FoodLog[]> {
  const start = weekStart(localDate);
  return db.foodLogs
    .where('localDate')
    .between(start, addDaysToLocalDate(start, 6), true, true)
    .toArray();
}

/**
 * Everything eaten since `fromDate`, for ranking meal ideas against what you
 * actually eat rather than against the library's own row for it.
 */
export async function getLogsSince(fromDate: string): Promise<FoodLog[]> {
  return db.foodLogs.where('localDate').aboveOrEqual(fromDate).toArray();
}

/**
 * Your rulings on what the unlogged days of this week cost, keyed by day.
 *
 * A Map rather than a list because every reader wants one day at a time, and
 * because it makes "no ruling" the cheap, ordinary case.
 */
export async function getDayOverridesForWeekOf(
  localDate: string,
): Promise<Map<string, DayIntakeOverride>> {
  const start = weekStart(localDate);
  const rows = await db.dayOverrides
    .where('localDate')
    .between(start, addDaysToLocalDate(start, 6), true, true)
    .toArray();
  return new Map(rows.map((row) => [row.localDate, row]));
}

/**
 * Rule on a day, or clear the ruling by passing `null` and hand the day back
 * to the automatic rule.
 */
export async function setDayOverride(
  localDate: string,
  mode: DayIntakeMode | null,
  kcal?: number | null,
): Promise<void> {
  if (mode === null) {
    await db.dayOverrides.delete(localDate);
    return;
  }
  await db.dayOverrides.put({ localDate, mode, kcal: kcal ?? null, updatedAt: Date.now() });
}

/**
 * What the quick-add sheet opens on. Recently eaten first, then whatever is
 * used most: after a couple of weeks the top of this list *is* your diet, and
 * logging a repeat meal costs two taps.
 */
export async function getQuickFoods(limit = 24): Promise<Food[]> {
  const all = await db.foods.toArray();
  const live = all.filter((f) => !f.isArchived);
  return live
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      const recency = (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      if (recency !== 0) return recency;
      return b.useCount - a.useCount;
    })
    .slice(0, limit);
}

export async function getFoodLibrary(includeArchived = false): Promise<Food[]> {
  const all = await db.foods.toArray();
  return all
    .filter((f) => includeArchived || !f.isArchived)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Bumps the recency counters that order the quick-add sheet. */
export async function touchFood(foodId: string): Promise<void> {
  const food = await db.foods.get(foodId);
  if (!food) return;
  await db.foods.put({ ...food, lastUsedAt: Date.now(), useCount: food.useCount + 1 });
}

/**
 * Every lift and run of the last few weeks, flattened to what Fuel needs to
 * tell a pre-workout meal from a recovery one.
 *
 * Unfinished sessions are kept, unlike in the history feed: a session still
 * open is exactly the case where "you are training right now" is the answer.
 * A run has no finish time of its own, so it is derived from its duration.
 */
export async function getTrainingSessions(
  weeks = 8,
  from = todayLocalDate(),
): Promise<TrainingSession[]> {
  const since = addDaysToLocalDate(from, -7 * weeks);
  const [workouts, runs] = await Promise.all([
    db.workouts.where('localDate').aboveOrEqual(since).toArray(),
    db.runs.where('localDate').aboveOrEqual(since).toArray(),
  ]);

  return [
    ...workouts.map((w) => ({
      kind: 'workout' as const,
      localDate: w.localDate,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt ?? null,
      inProgress: w.status === 'in_progress',
    })),
    ...runs.map((r) => ({
      kind: 'run' as const,
      localDate: r.localDate,
      startedAt: r.startedAt,
      finishedAt: r.startedAt + r.durationSec * 1000,
      inProgress: false,
    })),
  ];
}

export async function getWaterForDate(localDate: string): Promise<WaterLog[]> {
  const rows = await db.waterLogs.where('localDate').equals(localDate).toArray();
  return rows.sort((a, b) => a.loggedAt - b.loggedAt);
}
