import { db, newId } from '../db/db';
import type { PersonalRecord, PrType, WorkoutSet } from '../db/types';
import { epley1RM, isWorkingSet, setLoad, setVolume } from './calc';

/**
 * PRs are recomputed for a whole exercise rather than judged incrementally at
 * save time. Incremental detection cannot survive an edited or deleted set —
 * delete the session that set the record and the badge would linger forever.
 * A full chronological pass over one exercise is a few hundred rows.
 *
 * A record is a value *strictly greater* than everything logged before it, so
 * repeating your best does not re-award it.
 *
 * Bodyweight exercises are judged on their real load (your bodyweight plus
 * anything added), not on the added weight alone.
 *
 *  - weight : heaviest single working set
 *  - e1rm   : best Epley estimate from a single set (capped at 12 reps)
 *  - volume : most total working volume for this exercise within one session,
 *             credited to the set that pushed it past the old best
 */
export async function recomputeExercisePrs(exerciseId: string): Promise<void> {
  const all = await db.sets.where('exerciseId').equals(exerciseId).sortBy('completedAt');
  const working = all.filter(isWorkingSet);

  const tags = new Map<string, PrType[]>();
  const add = (setId: string, type: PrType) => {
    const list = tags.get(setId) ?? [];
    list.push(type);
    tags.set(setId, list);
  };

  let bestWeight = 0;
  let bestE1rm = 0;
  const holders: Partial<Record<PrType, WorkoutSet>> = {};

  for (const s of working) {
    const load = setLoad(s);
    if (load > bestWeight) {
      bestWeight = load;
      holders.weight = s;
      add(s.id, 'weight');
    }
    const e = epley1RM(load, s.reps);
    if (e !== null && e > bestE1rm) {
      bestE1rm = e;
      holders.e1rm = s;
      add(s.id, 'e1rm');
    }
  }

  // Session volume: walk sessions in chronological order, and within a session
  // walk sets in order, so the crossing set is the one that gets the badge.
  const bySession = new Map<string, WorkoutSet[]>();
  for (const s of working) {
    const list = bySession.get(s.workoutId) ?? [];
    list.push(s);
    bySession.set(s.workoutId, list);
  }
  const sessions = [...bySession.values()].sort(
    (a, b) => a[0].completedAt - b[0].completedAt,
  );

  let bestVolume = 0;
  for (const sets of sessions) {
    let running = 0;
    let crossed: WorkoutSet | null = null;
    for (const s of sets) {
      running += setVolume(setLoad(s), s.reps);
      if (crossed === null && running > bestVolume) crossed = s;
    }
    if (running > bestVolume) {
      bestVolume = running;
      if (crossed) {
        holders.volume = crossed;
        add(crossed.id, 'volume');
      }
    }
  }

  // Write back only the sets whose tags actually changed.
  const updates = all
    .map((s) => ({ s, next: tags.get(s.id) ?? [] }))
    .filter(({ s, next }) => !sameTags(s.prTypes ?? [], next));
  if (updates.length > 0) {
    await db.sets.bulkPut(updates.map(({ s, next }) => ({ ...s, prTypes: next })));
  }

  const values: Record<PrType, number> = { weight: bestWeight, e1rm: bestE1rm, volume: bestVolume };
  const records: PersonalRecord[] = [];
  for (const type of ['weight', 'e1rm', 'volume'] as PrType[]) {
    const holder = holders[type];
    if (!holder || values[type] <= 0) continue;
    records.push({
      id: newId(),
      exerciseId,
      workoutId: holder.workoutId,
      setId: holder.id,
      prType: type,
      value: Math.round(values[type] * 100) / 100,
      achievedAt: holder.completedAt,
    });
  }

  const stale = await db.personalRecords.where('exerciseId').equals(exerciseId).primaryKeys();
  await db.personalRecords.bulkDelete(stale);
  if (records.length > 0) await db.personalRecords.bulkAdd(records);
}

function sameTags(a: PrType[], b: PrType[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Full rebuild. Runs after any JSON import so a hand-edited file cannot leave stale records. */
export async function recomputeAllPrs(): Promise<void> {
  const ids = await db.exercises.toCollection().primaryKeys();
  for (const id of ids) await recomputeExercisePrs(id);
}

export const PR_LABEL: Record<PrType, string> = {
  weight: 'Weight PR',
  e1rm: 'e1RM PR',
  volume: 'Volume PR',
};

export const PR_SHORT: Record<PrType, string> = {
  weight: 'WT',
  e1rm: '1RM',
  volume: 'VOL',
};
