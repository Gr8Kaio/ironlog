import { db, DEFAULT_SETTINGS, newId } from './db';
import type {
  BodyMetric,
  Equipment,
  Exercise,
  MuscleGroup,
  SideMode,
  Routine,
  RoutineDay,
  RoutineExercise,
  Run,
  RunInterval,
  RunType,
  Workout,
  WorkoutSet,
} from './types';
import { addDaysToLocalDate, toEpoch, todayLocalDate, weekStart } from '../lib/dates';
import { recomputeAllPrs } from '../lib/prs';

/**
 * Seeded exercises use stable slug ids rather than random UUIDs. Two devices
 * seeded independently then agree on what "Back Squat" is, so an export from
 * one merges into the other without duplicating the whole library.
 */
type SeedExercise = [
  name: string,
  muscle: MuscleGroup,
  equipment: Equipment,
  increment: number,
  /** Only where the exercise is genuinely ambiguous about it. See `SideMode`. */
  sideMode?: SideMode,
  /** Shown above the steppers mid-set, so it is where a setup cue belongs. */
  notes?: string,
];

const LIBRARY: SeedExercise[] = [
  // barbell
  ['Back Squat', 'quads', 'barbell', 2.5],
  ['Front Squat', 'quads', 'barbell', 2.5],
  ['Deadlift', 'back', 'barbell', 5],
  ['Romanian Deadlift', 'hamstrings', 'barbell', 2.5],
  ['Bench Press', 'chest', 'barbell', 2.5],
  ['Incline Bench Press', 'chest', 'barbell', 2.5],
  ['Close-Grip Bench Press', 'triceps', 'barbell', 2.5],
  ['Overhead Press', 'shoulders', 'barbell', 2.5],
  ['Barbell Row', 'back', 'barbell', 2.5],
  ['Pendlay Row', 'back', 'barbell', 2.5],
  ['Barbell Curl', 'biceps', 'barbell', 1.25],
  ['Barbell Hip Thrust', 'glutes', 'barbell', 5],
  ['Barbell Shrug', 'back', 'barbell', 5],
  ['Good Morning', 'hamstrings', 'barbell', 2.5],
  // dumbbell
  ['Dumbbell Bench Press', 'chest', 'dumbbell', 2],
  ['Incline Dumbbell Press', 'chest', 'dumbbell', 2],
  ['Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 2],
  ['Dumbbell Row', 'back', 'dumbbell', 2, 'perSide'],
  ['Lateral Raise', 'shoulders', 'dumbbell', 1],
  ['Rear Delt Fly', 'shoulders', 'dumbbell', 1],
  ['Dumbbell Curl', 'biceps', 'dumbbell', 1],
  ['Hammer Curl', 'biceps', 'dumbbell', 1],
  ['Dumbbell Fly', 'chest', 'dumbbell', 2],
  ['Bulgarian Split Squat', 'quads', 'dumbbell', 2, 'perSide'],
  ['Walking Lunge', 'quads', 'dumbbell', 2, 'perSide'],
  ['Dumbbell Romanian Deadlift', 'hamstrings', 'dumbbell', 2],
  ['Goblet Squat', 'quads', 'dumbbell', 2],
  ['Skull Crusher', 'triceps', 'dumbbell', 1],
  // machine
  ['Leg Press', 'quads', 'machine', 5],
  ['Hack Squat', 'quads', 'machine', 5],
  ['Leg Extension', 'quads', 'machine', 2.5],
  ['Lying Leg Curl', 'hamstrings', 'machine', 2.5],
  ['Seated Leg Curl', 'hamstrings', 'machine', 2.5],
  // Two machines, two entries. One "Chest Press Machine" could not say which
  // of them a plan meant, and the two are different enough in shoulder angle
  // that the loads never matched from week to week.
  ['Chest Press Machine (upright)', 'chest', 'machine', 2.5, undefined,
    'La vertical: sentado con el torso derecho, empujas hacia adelante.'],
  ['Chest Press Machine (lying)', 'chest', 'machine', 2.5, undefined,
    'La acostada: espalda apoyada mirando arriba, empujas hacia el techo.'],
  ['Shoulder Press Machine', 'shoulders', 'machine', 2.5],
  ['Lat Pulldown', 'back', 'machine', 2.5],
  ['Seated Cable Row', 'back', 'machine', 2.5],
  ['Pec Deck', 'chest', 'machine', 2.5],
  ['Standing Calf Raise', 'calves', 'machine', 2.5],
  ['Seated Calf Raise', 'calves', 'machine', 2.5],
  ['Assisted Pull-up', 'back', 'machine', 2.5],
  // cable
  ['Cable Fly', 'chest', 'cable', 2.5, 'both'],
  ['Triceps Pushdown', 'triceps', 'cable', 2.5, 'both'],
  ['Overhead Cable Extension', 'triceps', 'cable', 2.5, 'both'],
  ['Cable Lateral Raise', 'shoulders', 'cable', 2.5, 'perSide'],
  ['Face Pull', 'shoulders', 'cable', 2.5, 'both'],
  ['Cable Curl', 'biceps', 'cable', 2.5, 'both'],
  ['Cable Crunch', 'core', 'cable', 2.5, 'both'],
  // bodyweight
  ['Pull-up', 'back', 'bodyweight', 1.25],
  ['Chin-up', 'back', 'bodyweight', 1.25],
  ['Dip', 'triceps', 'bodyweight', 1.25],
  ['Push-up', 'chest', 'bodyweight', 1],
  ['Plank', 'core', 'bodyweight', 1],
  ['Hanging Leg Raise', 'core', 'bodyweight', 1],
  ['Back Extension', 'back', 'bodyweight', 1.25],
  ['Ab Wheel Rollout', 'core', 'bodyweight', 1],
  ['Nordic Curl', 'hamstrings', 'bodyweight', 1],
  ['Standing Calf Raise (BW)', 'calves', 'bodyweight', 1],
  // kettlebell
  ['Kettlebell Swing', 'glutes', 'kettlebell', 4],
  ['Farmer Carry', 'forearms', 'kettlebell', 4],
];

export const slugify = (name: string): string =>
  'seed-' +
  name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function buildExercises(now: number): Exercise[] {
  return LIBRARY.map(([name, muscleGroup, equipment, incrementKg, sideMode, notes]) => ({
    id: slugify(name),
    name,
    muscleGroup,
    equipment,
    incrementKg,
    sideMode: sideMode ?? null,
    notes,
    isCustom: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

// ---------------------------------------------------------------- routine

/** [exercise name, sets, repMin, repMax, targetRpe, restSec, superset, demo start weight] */
type SeedPrescription = [string, number, number, number, number | null, number, string | null, number];

const SPLIT: { day: string; items: SeedPrescription[] }[] = [
  {
    day: 'Upper A - Strength',
    items: [
      ['Bench Press', 4, 4, 6, 8, 180, null, 80],
      ['Barbell Row', 4, 5, 8, 8, 150, null, 70],
      ['Overhead Press', 3, 5, 8, 8, 150, null, 45],
      ['Pull-up', 3, 6, 10, 9, 120, 'A', 0],
      ['Triceps Pushdown', 3, 10, 12, 9, 60, 'A', 30],
      ['Hammer Curl', 3, 10, 12, 9, 60, null, 14],
    ],
  },
  {
    day: 'Lower A - Strength',
    items: [
      ['Back Squat', 4, 4, 6, 8, 210, null, 100],
      ['Romanian Deadlift', 3, 6, 8, 8, 150, null, 90],
      ['Leg Press', 3, 8, 12, 9, 120, null, 160],
      ['Lying Leg Curl', 3, 10, 12, 9, 90, 'A', 40],
      ['Standing Calf Raise', 4, 10, 15, 9, 60, 'A', 60],
      ['Hanging Leg Raise', 3, 10, 15, null, 60, null, 0],
    ],
  },
  {
    day: 'Upper B - Hypertrophy',
    items: [
      ['Incline Dumbbell Press', 4, 8, 12, 9, 120, null, 28],
      ['Lat Pulldown', 4, 8, 12, 9, 120, null, 60],
      ['Dumbbell Shoulder Press', 3, 8, 12, 9, 120, null, 22],
      ['Seated Cable Row', 3, 10, 12, 9, 90, 'A', 55],
      ['Cable Fly', 3, 12, 15, 9, 60, 'A', 20],
      ['Face Pull', 3, 12, 15, 9, 60, null, 25],
      ['Cable Curl', 3, 10, 12, 9, 60, null, 25],
    ],
  },
  {
    day: 'Lower B - Hypertrophy',
    items: [
      ['Front Squat', 3, 6, 8, 8, 180, null, 70],
      ['Barbell Hip Thrust', 4, 8, 12, 9, 120, null, 100],
      ['Bulgarian Split Squat', 3, 8, 10, 9, 120, null, 20],
      ['Seated Leg Curl', 3, 10, 12, 9, 90, 'A', 45],
      ['Leg Extension', 3, 12, 15, 9, 60, 'A', 45],
      ['Seated Calf Raise', 4, 12, 15, 9, 60, null, 40],
    ],
  },
  {
    day: 'Upper C - Arms and Delts',
    items: [
      ['Close-Grip Bench Press', 4, 6, 10, 8, 150, null, 65],
      ['Chin-up', 3, 6, 10, 9, 120, null, 0],
      ['Lateral Raise', 4, 12, 15, 9, 60, 'A', 10],
      ['Rear Delt Fly', 4, 12, 15, 9, 60, 'A', 8],
      ['Barbell Curl', 3, 8, 12, 9, 90, 'B', 35],
      ['Overhead Cable Extension', 3, 10, 12, 9, 90, 'B', 27.5],
      ['Cable Crunch', 3, 12, 15, null, 60, null, 35],
    ],
  },
];

// ---------------------------------------------------------------- demo data

/** Deterministic PRNG so a reseed produces the same demo history every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKS_OF_HISTORY = 5;

/** Weekday offsets from the Monday of each week: Mon, Tue, Thu, Fri, Sat. */
const LIFT_DAY_OFFSETS = [0, 1, 3, 4, 5];

interface DemoData {
  workouts: Workout[];
  sets: WorkoutSet[];
  runs: Run[];
  intervals: RunInterval[];
  bodyMetrics: BodyMetric[];
}

function buildDemoData(days: RoutineDay[], routineId: string, prescriptions: RoutineExercise[]): DemoData {
  const rand = mulberry32(20260826);
  const out: DemoData = { workouts: [], sets: [], runs: [], intervals: [], bodyMetrics: [] };

  const byDay = new Map<string, RoutineExercise[]>();
  for (const p of prescriptions) {
    const list = byDay.get(p.routineDayId) ?? [];
    list.push(p);
    byDay.set(p.routineDayId, list);
  }
  const startWeight = new Map<string, number>();
  SPLIT.forEach((block, dayIndex) => {
    for (const item of block.items) {
      startWeight.set(`${days[dayIndex].id}:${slugify(item[0])}`, item[7]);
    }
  });

  const thisMonday = weekStart(todayLocalDate());

  for (let week = WEEKS_OF_HISTORY - 1; week >= 0; week--) {
    const monday = addDaysToLocalDate(thisMonday, -7 * week);
    const weekIndex = WEEKS_OF_HISTORY - 1 - week; // 0 = oldest

    // --- lifting
    LIFT_DAY_OFFSETS.forEach((offset, dayIndex) => {
      const localDate = addDaysToLocalDate(monday, offset);
      if (localDate > todayLocalDate()) return;

      const day = days[dayIndex];
      const startedAt = toEpoch(localDate, offset === 5 ? '10:15' : '18:30');
      const workout: Workout = {
        id: newId(),
        routineId,
        routineDayId: day.id,
        name: day.name,
        startedAt,
        localDate,
        finishedAt: startedAt + Math.round((62 + rand() * 18) * 60_000),
        status: 'completed',
        bodyWeightKg: null,
      };
      out.workouts.push(workout);

      let cursor = startedAt + 6 * 60_000;
      for (const p of byDay.get(day.id) ?? []) {
        const base = startWeight.get(`${day.id}:${p.exerciseId}`) ?? 20;
        // Roughly one increment every two weeks, with the odd stalled week.
        const progressed = base * (1 + weekIndex * 0.018);
        const target = base === 0 ? 0 : roundTo(progressed, 2.5);

        for (let n = 1; n <= p.targetSets; n++) {
          const fatigue = n > 2 ? 1 - (n - 2) * 0.03 : 1;
          const reps = Math.max(
            p.repMin,
            Math.min(p.repMax, Math.round(p.repMax - (n - 1) * 0.6 + (rand() - 0.5))),
          );
          cursor += Math.round((p.restSeconds + 35 + rand() * 25) * 1000);
          out.sets.push({
            id: newId(),
            workoutId: workout.id,
            exerciseId: p.exerciseId,
            setNumber: n,
            weightKg: base === 0 ? 0 : roundTo(target * fatigue, 2.5),
            reps,
            rpe: p.targetRpe ? clamp(p.targetRpe + (n - 1) * 0.5, 6, 10) : null,
            setType: 'working',
            note: n === p.targetSets && rand() > 0.88 ? 'Left side lagging, slow down the eccentric' : undefined,
            completedAt: cursor,
            prTypes: [],
          });
        }
      }
    });

    // --- running: easy Wednesday, tempo or intervals Thursday, long Sunday
    const easyDate = addDaysToLocalDate(monday, 2);
    pushRun(out, rand, easyDate, '07:10', 'easy', 6 + weekIndex * 0.4, 340 + rand() * 12);

    const qualityDate = addDaysToLocalDate(monday, 3);
    if (weekIndex % 2 === 0) {
      pushRun(out, rand, qualityDate, '07:00', 'tempo', 8, 292 + rand() * 8);
    } else {
      const run = pushRun(out, rand, qualityDate, '07:00', 'intervals', 9.2, 330 + rand() * 10);
      if (run) {
        const repPace = 205 - weekIndex * 2;
        for (let rep = 1; rep <= 6; rep++) {
          out.intervals.push({
            id: newId(),
            runId: run.id,
            repNumber: rep,
            distanceM: 800,
            durationSec: Math.round((repPace + (rep - 1) * 1.6 + (rand() - 0.5) * 4) * 0.8),
            restSec: 120,
            note: rep === 6 ? 'Last one hurt' : undefined,
          });
        }
      }
    }

    const longDate = addDaysToLocalDate(monday, 6);
    pushRun(out, rand, longDate, '08:30', 'long', 14 + weekIndex * 1.2, 368 + rand() * 14);

    // --- body weight, once a week
    const weighDate = addDaysToLocalDate(monday, 0);
    if (weighDate <= todayLocalDate()) {
      out.bodyMetrics.push({
        id: newId(),
        measuredAt: toEpoch(weighDate, '07:30'),
        localDate: weighDate,
        weightKg: roundTo(78.4 - weekIndex * 0.25 + (rand() - 0.5) * 0.6, 0.1),
        waistCm: weekIndex % 2 === 0 ? roundTo(82 - weekIndex * 0.2, 0.5) : null,
        notes: undefined,
      });
    }
  }

  return out;
}

function pushRun(
  out: DemoData,
  rand: () => number,
  localDate: string,
  time: string,
  runType: RunType,
  distanceKm: number,
  paceSecPerKm: number,
): Run | null {
  if (localDate > todayLocalDate()) return null;
  const km = roundTo(distanceKm, 0.1);
  const run: Run = {
    id: newId(),
    startedAt: toEpoch(localDate, time),
    localDate,
    distanceKm: km,
    durationSec: Math.round(km * paceSecPerKm),
    runType,
    route: ROUTES[runType],
    effort: EFFORT[runType] + (rand() > 0.7 ? 1 : 0),
    kneeFeel: rand() > 0.82 ? 'niggle' : 'fine',
    surface: runType === 'long' && rand() > 0.6 ? 'trail' : 'road',
    tempC: Math.round(11 + rand() * 9),
    weather: rand() > 0.75 ? 'Windy' : 'Clear',
    notes: runType === 'long' ? 'Negative split the last 3 km' : undefined,
  };
  out.runs.push(run);
  return run;
}

const ROUTES: Record<RunType, string> = {
  easy: 'River loop',
  tempo: 'Canal path out and back',
  intervals: 'Track',
  long: 'Reservoir loop',
  race: 'City 10K',
};

const EFFORT: Record<RunType, number> = { easy: 3, tempo: 7, intervals: 8, long: 5, race: 9 };

// Rounding to a 0.1 step reintroduces float noise (77.1 lands as
// 77.10000000000001), so the result is trimmed back to 2 decimals.
const roundTo = (value: number, step: number) =>
  Math.round((Math.round(value / step) * step) * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------- entry points

/**
 * Populates an empty database. Never touches an existing one.
 *
 * The in-flight promise is not defensive padding: React StrictMode invokes
 * mount effects twice, and two concurrent calls both read count === 0 before
 * either writes, which seeds the demo history twice over.
 */
let seeding: Promise<boolean> | null = null;

export function seedIfEmpty(): Promise<boolean> {
  seeding ??= runSeedIfEmpty().finally(() => {
    seeding = null;
  });
  return seeding;
}

async function runSeedIfEmpty(): Promise<boolean> {
  const count = await db.exercises.count();
  if (count > 0) return false;
  await seedAll({ withDemoHistory: true });
  return true;
}

export async function seedAll({ withDemoHistory }: { withDemoHistory: boolean }): Promise<void> {
  const now = Date.now();
  const exercises = buildExercises(now);

  const routine: Routine = {
    id: 'seed-routine-upper-lower',
    name: '5-Day Upper/Lower',
    isActive: true,
    notes: 'Mon / Tue / Thu / Fri / Sat',
    createdAt: now,
    updatedAt: now,
  };

  const days: RoutineDay[] = SPLIT.map((block, i) => ({
    id: `seed-day-${i + 1}`,
    routineId: routine.id,
    name: block.day,
    position: i,
  }));

  const prescriptions: RoutineExercise[] = [];
  SPLIT.forEach((block, dayIndex) => {
    block.items.forEach(([name, sets, repMin, repMax, rpe, rest, superset], i) => {
      prescriptions.push({
        id: `seed-rx-${dayIndex + 1}-${i + 1}`,
        routineDayId: days[dayIndex].id,
        exerciseId: slugify(name),
        position: i,
        supersetGroup: superset,
        targetSets: sets,
        repMin,
        repMax,
        targetRpe: rpe,
        restSeconds: rest,
      });
    });
  });

  const demo = withDemoHistory
    ? buildDemoData(days, routine.id, prescriptions)
    : { workouts: [], sets: [], runs: [], intervals: [], bodyMetrics: [] };

  await db.transaction(
    'rw',
    [
      db.exercises,
      db.routines,
      db.routineDays,
      db.routineExercises,
      db.workouts,
      db.sets,
      db.runs,
      db.runIntervals,
      db.bodyMetrics,
      db.settings,
    ],
    async () => {
      await db.exercises.bulkPut(exercises);
      await db.routines.put(routine);
      await db.routineDays.bulkPut(days);
      await db.routineExercises.bulkPut(prescriptions);
      await db.workouts.bulkPut(demo.workouts);
      await db.sets.bulkPut(demo.sets);
      await db.runs.bulkPut(demo.runs);
      await db.runIntervals.bulkPut(demo.intervals);
      await db.bodyMetrics.bulkPut(demo.bodyMetrics);
      await db.settings.put(DEFAULT_SETTINGS);
    },
  );

  await recomputeAllPrs();
}

/** Wipes everything and rebuilds the demo database. Settings screen only. */
export async function resetToSeed(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  await seedAll({ withDemoHistory: true });
}

/** Wipes everything and leaves a clean library with no history. */
export async function resetToEmpty(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  await seedAll({ withDemoHistory: false });
}
