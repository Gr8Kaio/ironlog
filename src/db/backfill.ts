import { db, getSettings, newId, updateSettings } from './db';
import type { Exercise, RoutineExercise, SideMode } from './types';
import { buildExercises } from './seed';
import { recomputeExercisePrs } from '../lib/prs';

/**
 * Sets logged before bodyweight exercises carried a load have no
 * `bodyWeightKg`, so a pull-up still reads as `0 kg` and counts for nothing.
 * This stamps them once, on the way in.
 *
 * The weigh-in used is the one nearest each set's own date rather than the
 * latest one: crediting a pull-up from six months ago with today's weight
 * would invent a trend that never happened. Only sets that predate the field
 * are touched, so this is a no-op on every run after the first.
 */
export async function backfillBodyweightSets(): Promise<number> {
  const bodyweightIds = new Set(
    (await db.exercises.where('equipment').equals('bodyweight').primaryKeys()) as string[],
  );
  if (bodyweightIds.size === 0) return 0;

  const stale = (await db.sets.toArray()).filter(
    (s) => bodyweightIds.has(s.exerciseId) && s.bodyWeightKg === undefined,
  );
  if (stale.length === 0) return 0;

  const weighIns = (await db.bodyMetrics.orderBy('measuredAt').toArray()).filter(
    (m) => m.weightKg != null,
  );

  const nearest = (at: number): number => {
    if (weighIns.length === 0) return 0;
    let best = weighIns[0];
    for (const m of weighIns) {
      if (Math.abs(m.measuredAt - at) < Math.abs(best.measuredAt - at)) best = m;
    }
    return best.weightKg as number;
  };

  await db.sets.bulkPut(
    stale.map((s) => ({ ...s, bodyWeightKg: nearest(s.completedAt) })),
  );

  // Those sets now have a load, so their exercises have records they never had.
  for (const exerciseId of new Set(stale.map((s) => s.exerciseId))) {
    await recomputeExercisePrs(exerciseId);
  }

  return stale.length;
}

// ------------------------------------------------------- the shipped library

/**
 * Side modes for exercises this build did not ship, matched on name.
 *
 * Custom rows have no slug to match on, so the name is all there is. It only
 * ever fills a blank — a row whose `sideMode` has been set, to a value or
 * explicitly to none, is never touched.
 */
const CUSTOM_SIDE_MODES: [name: string, mode: SideMode][] = [
  ['single arm triceps pushdown', 'perSide'],
  ['unilateral leg curl', 'perSide'],
  ['bayesian bicep curl', 'perSide'],
  ['pull over', 'both'],
  ['rear delt flies', 'both'],
  ['remo t', 'both'],
];

/** The generic chest press, now split into the upright and the lying machine. */
const GENERIC_CHEST_PRESS = 'seed-chest-press-machine';
const UPRIGHT_CHEST_PRESS = 'seed-chest-press-machine-upright';

/**
 * Brings a library that was seeded by an earlier build up to this one.
 *
 * `seedIfEmpty` only fires on a device with nothing on it, so without this an
 * exercise added to the shipped list would never reach an install that has
 * history — which is every install that matters.
 *
 * Every step below is a no-op on its second run.
 */
export async function migrateExerciseLibrary(): Promise<void> {
  const existing = await db.exercises.toArray();
  if (existing.length === 0) return; // A fresh device: `seedIfEmpty` owns this.

  const byId = new Map(existing.map((e) => [e.id, e]));
  const now = Date.now();

  // 1. Anything shipped that this library has never seen.
  const missing = buildExercises(now).filter((e) => !byId.has(e.id));
  if (missing.length > 0) await db.exercises.bulkAdd(missing);

  // 2. Fill in side modes, on shipped rows you have not edited and on custom
  //    rows by name. `undefined` is "never asked"; `null` is "asked, and it
  //    does not apply", which is an answer and is left alone.
  const shipped = new Map(buildExercises(now).map((e) => [e.id, e]));
  const stamped: Exercise[] = [];
  for (const exercise of existing) {
    if (exercise.sideMode !== undefined) continue;
    const fromSeed = shipped.get(exercise.id)?.sideMode ?? null;
    const fromName =
      CUSTOM_SIDE_MODES.find(([name]) => name === exercise.name.trim().toLowerCase())?.[1] ?? null;
    const mode = fromSeed ?? fromName;
    if (mode) stamped.push({ ...exercise, sideMode: mode });
  }
  if (stamped.length > 0) await db.exercises.bulkPut(stamped);

  // 3. The chest press split. Plans pointing at the entry that could not say
  //    which machine it meant move to the upright one, and the ambiguous row
  //    is archived rather than deleted: it still has your logged sets on it,
  //    and archiving only takes it out of the pickers.
  if (byId.has(GENERIC_CHEST_PRESS) && !byId.get(GENERIC_CHEST_PRESS)!.isArchived) {
    const slots = await db.routineExercises.where('exerciseId').equals(GENERIC_CHEST_PRESS).toArray();
    await db.routineExercises.bulkPut(
      slots.map((slot) => ({ ...slot, exerciseId: UPRIGHT_CHEST_PRESS })),
    );
    await db.exercises.update(GENERIC_CHEST_PRESS, { isArchived: true, updatedAt: now });
  }
}

// --------------------------------------------------------- what the gym has

/**
 * The gym has one calf raise and one hip thrust, and they are the standing
 * machine and the hip thrust machine. Any plan slot on the other variant
 * moves to the one that exists, and the variant that does not exist leaves
 * the pickers (archived, so it is one tap to bring back).
 */
const GYM_SWAPS: [from: string, to: string][] = [
  ['seed-seated-calf-raise', 'seed-standing-calf-raise'],
  ['seed-barbell-hip-thrust', 'seed-hip-thrust-machine'],
];

/** The Shred plan, and what each of its days becomes. */
const SHRED_ROUTINE = '9b2f437e-8795-4d51-bf11-e042770844a6';

/** [exercise, sets, repMin, repMax, rpe, rest, superset] — used only for slots the day did not already have. */
type Slot = [id: string, sets: number, repMin: number, repMax: number, rpe: number | null, rest: number, superset: string | null];

/**
 * Five exercises a day, six where the sixth is a cheap superset partner.
 * What left each day went to where it already had a home: the core work
 * lives on the metcon day, and the unilateral leg extension goes in next to
 * the leg curl it was always paired with.
 */
const SHRED_DAYS: { name: string; slots: Slot[] }[] = [
  {
    name: 'Upper A',
    slots: [
      ['seed-bench-press', 4, 5, 7, 8, 150, 'A'],
      ['seed-barbell-row', 4, 6, 8, 8, 150, 'A'],
      ['seed-incline-dumbbell-press', 3, 8, 12, 8, 90, 'B'],
      ['seed-lat-pulldown', 3, 10, 12, 8, 90, 'B'],
      ['seed-lateral-raise', 3, 12, 15, 9, 60, 'C'],
      ['seed-face-pull', 3, 15, 20, 9, 60, 'C'],
    ],
  },
  {
    name: 'Lower A',
    slots: [
      ['seed-back-squat', 4, 5, 8, 8, 180, null],
      ['seed-romanian-deadlift', 3, 8, 10, 8, 150, null],
      ['seed-leg-press', 3, 10, 15, 8, 90, 'A'],
      ['seed-lying-leg-curl', 3, 10, 15, 8, 90, 'A'],
      ['seed-leg-extension', 3, 10, 15, 9, 60, null],
      ['seed-standing-calf-raise', 4, 10, 15, 8, 60, null],
    ],
  },
  {
    name: 'Upper B',
    slots: [
      ['seed-overhead-press', 4, 6, 8, 8, 150, null],
      ['seed-pull-up', 4, 5, 8, 8, 150, null],
      ['seed-chest-press-machine-upright', 3, 10, 15, 8, 90, 'A'],
      ['seed-seated-cable-row', 3, 10, 15, 8, 90, 'A'],
      ['seed-cable-curl', 3, 10, 15, 9, 60, 'B'],
      ['seed-triceps-pushdown', 3, 10, 15, 9, 60, 'B'],
    ],
  },
  {
    name: 'Lower B',
    slots: [
      ['seed-deadlift', 3, 4, 6, 8, 180, null],
      ['seed-bulgarian-split-squat', 3, 8, 12, 8, 120, null],
      ['seed-hip-thrust-machine', 3, 8, 12, 8, 90, null],
      ['seed-seated-leg-curl', 3, 10, 15, 8, 90, 'A'],
      ['seed-single-leg-extension', 3, 10, 15, 9, 60, 'A'],
      ['seed-standing-calf-raise', 4, 12, 20, 9, 60, null],
    ],
  },
  {
    name: 'Metcon',
    slots: [
      ['seed-kettlebell-swing', 4, 15, 20, null, 60, 'A'],
      ['seed-farmer-carry', 4, 30, 45, null, 90, 'A'],
      ['seed-hanging-leg-raise', 3, 8, 15, 9, 45, null],
      ['seed-ab-wheel-rollout', 3, 8, 12, 9, 60, null],
      ['seed-cable-crunch', 3, 12, 20, 9, 45, null],
    ],
  },
];

const GYM_MIGRATION = 'gym-variants-2026-09';

/**
 * Applied once per device, then never again, so anything it changes stays
 * yours to change back. A day is only rebuilt if its name still starts the
 * way it did when this was written: a day you have renamed or reshaped since
 * is a day you have taken over, and it is left alone.
 */
export async function migrateGymVariants(): Promise<void> {
  const settings = await getSettings();
  const applied = settings.migrations ?? [];
  if (applied.includes(GYM_MIGRATION)) return;
  if ((await db.exercises.count()) === 0) return;

  const now = Date.now();
  await db.transaction('rw', [db.exercises, db.routineDays, db.routineExercises], async () => {
    for (const [from, to] of GYM_SWAPS) {
      if (!(await db.exercises.get(to))) continue;
      const slots = await db.routineExercises.where('exerciseId').equals(from).toArray();
      await db.routineExercises.bulkPut(slots.map((slot) => ({ ...slot, exerciseId: to })));
      await db.exercises.update(from, { isArchived: true, updatedAt: now });
    }

    const days = await db.routineDays.where('routineId').equals(SHRED_ROUTINE).sortBy('position');
    for (const plan of SHRED_DAYS) {
      const day = days.find((d) => d.name.startsWith(plan.name));
      if (!day) continue;
      const current = await db.routineExercises.where('routineDayId').equals(day.id).toArray();
      const rebuilt: RoutineExercise[] = plan.slots.map(
        ([exerciseId, sets, repMin, repMax, rpe, rest, superset], i) => {
          const kept = current.find((c) => c.exerciseId === exerciseId);
          // A slot the day already had keeps its id and your numbers; only its
          // place in the order and its superset partner are the new plan's.
          return kept
            ? { ...kept, position: i + 1, supersetGroup: superset }
            : {
                id: newId(),
                routineDayId: day.id,
                exerciseId,
                position: i + 1,
                supersetGroup: superset,
                targetSets: sets,
                repMin,
                repMax,
                targetRpe: rpe,
                restSeconds: rest,
              };
        },
      );
      const keptIds = new Set(rebuilt.map((r) => r.id));
      await db.routineExercises.bulkDelete(current.filter((c) => !keptIds.has(c.id)).map((c) => c.id));
      await db.routineExercises.bulkPut(rebuilt);
    }
  });

  await updateSettings({ migrations: [...applied, GYM_MIGRATION] });
}
