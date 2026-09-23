import { db } from './db';
import type { Exercise, SideMode } from './types';
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
