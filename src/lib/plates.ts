import type { PlateStock } from '../db/types';

export interface PlateSolution {
  /** Plates for one side, heaviest first. */
  perSide: { weightKg: number; count: number }[];
  /** Total bar weight actually achievable with the plates on hand. */
  achievedKg: number;
  /** True when the target is hit exactly. */
  exact: boolean;
  /** How far short the solution falls, in kg. Zero when exact. */
  shortByKg: number;
  /** Set when the target is not loadable at all (below the bar, or odd). */
  problem?: string;
}

/**
 * Greedy heaviest-first, bounded by the pairs actually in the inventory.
 *
 * Greedy is optimal for the standard kg plate set (each denomination is at
 * least double the next once you pass 2.5), and being inventory-aware is the
 * whole point: a solution that needs four pairs of 20s when the rack has two
 * is not a solution.
 */
export function solvePlates(
  targetKg: number,
  barKg: number,
  inventory: PlateStock[],
): PlateSolution {
  const empty = { perSide: [], achievedKg: barKg, exact: false, shortByKg: 0 };

  if (targetKg < barKg) {
    return { ...empty, problem: `Below the ${barKg} kg bar` };
  }
  if (targetKg === barKg) {
    return { perSide: [], achievedKg: barKg, exact: true, shortByKg: 0 };
  }

  let remainingPerSide = (targetKg - barKg) / 2;
  const perSide: { weightKg: number; count: number }[] = [];
  const plates = [...inventory].filter((p) => p.pairs > 0).sort((a, b) => b.weightKg - a.weightKg);

  for (const plate of plates) {
    // Float noise: 62.5 - 25 - 25 lands at 12.499999999999998 without the epsilon.
    const count = Math.min(plate.pairs, Math.floor((remainingPerSide + 1e-9) / plate.weightKg));
    if (count > 0) {
      perSide.push({ weightKg: plate.weightKg, count });
      remainingPerSide -= count * plate.weightKg;
    }
  }

  const shortByKg = Math.round(remainingPerSide * 2 * 100) / 100;
  const achievedKg = Math.round((targetKg - shortByKg) * 100) / 100;
  return {
    perSide,
    achievedKg,
    exact: shortByKg === 0,
    shortByKg,
    problem: shortByKg > 0 ? `Closest is ${achievedKg} kg with these plates` : undefined,
  };
}

/** `2x20, 1x10, 1x2.5` — the string you read off while loading the bar. */
export function formatPerSide(solution: PlateSolution): string {
  if (solution.perSide.length === 0) return 'Empty bar';
  return solution.perSide.map((p) => `${p.count}x${p.weightKg}`).join(', ');
}
