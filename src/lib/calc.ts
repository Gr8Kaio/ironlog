import type { WorkoutSet } from '../db/types';

/**
 * Derived numbers live here and are computed on read. Nothing in this file is
 * ever persisted, which is what keeps an edited set from leaving a stale
 * e1RM or pace behind it.
 */

/** Above this the Epley curve stops describing anything real. */
export const E1RM_REP_CAP = 12;

/**
 * Epley: w x (1 + reps/30). Returns null past the rep cap rather than a
 * confident fiction — a set of 20 does not tell you a 1RM.
 */
export function epley1RM(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0) return null;
  if (reps > E1RM_REP_CAP) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setVolume(weightKg: number, reps: number): number {
  return weightKg * reps;
}

/**
 * What the set actually moved. For a bodyweight exercise `weightKg` holds only
 * what was *added* to you, so the load is your bodyweight plus that; every
 * derived number (volume, e1RM, PRs) reads through here rather than off
 * `weightKg`, otherwise a set of pull-ups would count as zero.
 */
export function setLoad(s: Pick<WorkoutSet, 'weightKg' | 'bodyWeightKg'>): number {
  return s.weightKg + (s.bodyWeightKg ?? 0);
}

/** True for a set logged against a bodyweight exercise. */
export function isBodyweightSet(s: Pick<WorkoutSet, 'bodyWeightKg'>): boolean {
  return s.bodyWeightKg != null;
}

/** Working sets only — warmups must not inflate volume or weekly set counts. */
export function isWorkingSet(s: WorkoutSet): boolean {
  return s.setType !== 'warmup';
}

export function workoutVolume(sets: WorkoutSet[]): number {
  return sets.filter(isWorkingSet).reduce((t, s) => t + setVolume(setLoad(s), s.reps), 0);
}

/** Heaviest set, ties broken by reps. */
export function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  for (const s of sets.filter(isWorkingSet)) {
    const load = setLoad(s);
    const bestLoad = best ? setLoad(best) : -Infinity;
    if (!best || load > bestLoad || (load === bestLoad && s.reps > best.reps)) {
      best = s;
    }
  }
  return best;
}

export function bestE1RM(sets: WorkoutSet[]): number | null {
  let best: number | null = null;
  for (const s of sets.filter(isWorkingSet)) {
    const e = epley1RM(setLoad(s), s.reps);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best;
}

// ---------------------------------------------------------------- running

/**
 * Pace is always derived. There is no code path in this app that accepts a
 * typed pace, by design.
 */
export function paceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / distanceKm;
}

/** `5:12/km`, or `--` when the inputs cannot produce a pace. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm)) return '--';
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

export function paceOf(distanceKm: number, durationSec: number): string {
  return formatPace(paceSecPerKm(distanceKm, durationSec));
}

/** `48:20` under an hour, `1:02:44` over it. */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** `2:30` for a rest timer — always mm:ss, never bare seconds. */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- numbers

/** Drops trailing zeroes so 100 reads as `100` and 102.5 as `102.5`. */
export function fmtKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

/**
 * How a set's load reads on screen. A bodyweight set with nothing added shows
 * the word, not a zero; anything hung off a belt shows as an increment on it.
 */
export function loadLabel(s: Pick<WorkoutSet, 'weightKg' | 'bodyWeightKg'>): {
  value: string;
  unit: string | null;
} {
  if (!isBodyweightSet(s)) return { value: fmtKg(s.weightKg), unit: 'kg' };
  if (s.weightKg === 0) return { value: 'Bodyweight', unit: null };
  return { value: `BW +${fmtKg(s.weightKg)}`, unit: 'kg' };
}

/** The same thing in one string, for dense rows like the `Last` line. */
export function loadLabelShort(s: Pick<WorkoutSet, 'weightKg' | 'bodyWeightKg'>): string {
  if (!isBodyweightSet(s)) return fmtKg(s.weightKg);
  return s.weightKg === 0 ? 'BW' : `BW+${fmtKg(s.weightKg)}`;
}

export function fmtKm(km: number): string {
  return String(Math.round(km * 100) / 100);
}

export function fmtNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Round to the nearest loadable step for this exercise. */
export function snapToIncrement(kg: number, incrementKg: number): number {
  if (incrementKg <= 0) return kg;
  return Math.round((kg / incrementKg)) * incrementKg;
}
