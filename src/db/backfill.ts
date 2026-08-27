import { db } from './db';
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
