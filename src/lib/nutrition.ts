/**
 * Macro arithmetic and the weekly budget.
 *
 * The weekly budget is the whole reason this lives in IronLog rather than in a
 * generic tracker: body fat answers to the weekly energy balance, so a single
 * big meal is something to *budget for*, not a day to write off. Every number
 * here reads a week at a time and reports what is left per remaining day.
 */
import type { Food, FoodLog, MealSlot, Portion } from '../db/types';
// Explicit extension so scripts/check-math.ts can load this module in Node.
import { addDaysToLocalDate, daysBetween, todayLocalDate, weekStart } from './dates.ts';

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export const ZERO: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

/** Atwater factors, for sanity-checking a hand-entered food against its label. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, fiber: 2 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
    fiberG: a.fiberG + b.fiberG,
  };
}

/** What `amount` of this food comes to. `amount` is in the food's `refUnit`. */
export function macrosFor(food: Food, amount: number): Macros {
  const factor = food.refAmount > 0 ? amount / food.refAmount : 0;
  return {
    kcal: food.kcal * factor,
    proteinG: food.proteinG * factor,
    carbsG: food.carbsG * factor,
    fatG: food.fatG * factor,
    fiberG: (food.fiberG ?? 0) * factor,
  };
}

export function macrosOfLog(log: FoodLog): Macros {
  return {
    kcal: log.kcal,
    proteinG: log.proteinG,
    carbsG: log.carbsG,
    fatG: log.fatG,
    fiberG: log.fiberG ?? 0,
  };
}

export function totalMacros(logs: FoodLog[]): Macros {
  return logs.reduce((acc, log) => addMacros(acc, macrosOfLog(log)), ZERO);
}

export function macrosByMeal(logs: FoodLog[]): Record<MealSlot, Macros> {
  const out = {
    breakfast: ZERO,
    lunch: ZERO,
    dinner: ZERO,
    snack: ZERO,
  } as Record<MealSlot, Macros>;
  for (const log of logs) out[log.meal] = addMacros(out[log.meal], macrosOfLog(log));
  return out;
}

/**
 * Energy implied by the macros, for comparing against a stated kcal figure.
 *
 * Fibre is subtracted from the carbohydrate figure before it is counted, then
 * added back at its own rate. Both labels and USDA report carbohydrate "by
 * difference", which already *includes* the fibre, and fibre is only partly
 * metabolised. Charging it the full 4 kcal/g overstates any high-fibre food
 * badly enough to cry wolf: raw broccoli comes out 21% over, lettuce 22%, so
 * every vegetable entered from a label would raise a warning that is wrong.
 */
export function impliedKcal(
  m: Pick<Macros, 'proteinG' | 'carbsG' | 'fatG'> & { fiberG?: number | null },
): number {
  const fiber = Math.min(Math.max(m.fiberG ?? 0, 0), m.carbsG);
  const netCarbs = m.carbsG - fiber;
  return (
    m.proteinG * KCAL_PER_G.protein +
    netCarbs * KCAL_PER_G.carbs +
    fiber * KCAL_PER_G.fiber +
    m.fatG * KCAL_PER_G.fat
  );
}

/**
 * Labels round each field independently and manufacturers may use food-specific
 * Atwater factors, so several percent of drift is ordinary. This is set to
 * catch a typo or a wrong unit, not to audit a label.
 */
export const ENERGY_TOLERANCE = 0.15;

/** Null when the stated energy is close enough to the macros to be plausible. */
export function energyMismatch(
  food: Pick<Food, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'> & { fiberG?: number | null },
): number | null {
  const implied = impliedKcal(food);
  if (implied <= 0 || food.kcal <= 0) return null;
  const drift = Math.abs(implied - food.kcal) / food.kcal;
  return drift > ENERGY_TOLERANCE ? Math.round(implied) : null;
}

// --------------------------------------------------------------- the budget

export interface WeekBudget {
  weekStartDate: string;
  /** kcalTarget × 7. */
  budgetKcal: number;
  consumedKcal: number;
  /** The week's intake before today, which is what today's allowance is set from. */
  consumedBeforeTodayKcal: number;
  /** Days already begun, today included. */
  daysElapsed: number;
  daysLeft: number;
  remainingKcal: number;
  /** What each remaining day can hold. Negative means the week is already spent. */
  perDayLeft: number | null;
  /** Consumed minus what should have been consumed by now. Negative is ahead. */
  driftKcal: number;
  estimatedCount: number;
  loggedCount: number;
}

export function buildWeekBudget(
  logs: FoodLog[],
  kcalTarget: number,
  today = todayLocalDate(),
): WeekBudget {
  const start = weekStart(today);
  const inWeek = logs.filter(
    (l) => l.localDate >= start && l.localDate <= addDaysToLocalDate(start, 6),
  );

  const consumedKcal = inWeek.reduce((sum, l) => sum + l.kcal, 0);
  const consumedBeforeTodayKcal = inWeek
    .filter((l) => l.localDate < today)
    .reduce((sum, l) => sum + l.kcal, 0);
  // daysBetween counts whole days, so today is elapsed the moment it starts.
  const daysElapsed = Math.min(7, Math.max(1, daysBetween(start, today) + 1));
  const daysLeft = 7 - daysElapsed;
  const budgetKcal = kcalTarget * 7;
  const remainingKcal = budgetKcal - consumedKcal;

  return {
    weekStartDate: start,
    budgetKcal,
    consumedKcal,
    consumedBeforeTodayKcal,
    daysElapsed,
    daysLeft,
    remainingKcal,
    // Today is not over, so it shares the remainder with the days still ahead.
    perDayLeft: remainingKcal / Math.max(1, daysLeft + 1),
    driftKcal: consumedKcal - kcalTarget * daysElapsed,
    estimatedCount: inWeek.filter((l) => l.estimated).length,
    loggedCount: inWeek.length,
  };
}

/**
 * Spend `dayKcal` on one of the days still to come and this is what each of
 * the *other* remaining days can hold. Null when no day is left to absorb it.
 *
 * Takes the whole day rather than just the big meal on purpose: the day of an
 * asado still has a breakfast in it, and asking for the meal alone would hide
 * that. One number, no buried assumption.
 *
 * Which day it falls on does not change the answer. The remaining days are
 * today plus `daysLeft`; whichever one is the big day, the others number
 * `daysLeft`.
 *
 * This is the answer to Sunday lunch at the in-laws: settle the number during
 * the week, then eat without doing arithmetic at the table.
 */
export function planBigDay(budget: WeekBudget, dayKcal: number): number | null {
  const otherDays = budget.daysLeft;
  if (otherDays < 1) return null;
  return (budget.remainingKcal - dayKcal) / otherDays;
}

export interface DayTotal {
  localDate: string;
  kcal: number;
  proteinG: number;
  estimatedCount: number;
  isToday: boolean;
  isFuture: boolean;
}

/** The seven days of the week containing `today`, oldest first. */
export function weekDayTotals(logs: FoodLog[], today: string): DayTotal[] {
  const start = weekStart(today);
  const out: DayTotal[] = [];
  for (let i = 0; i < 7; i++) {
    const localDate = addDaysToLocalDate(start, i);
    const dayLogs = logs.filter((l) => l.localDate === localDate);
    out.push({
      localDate,
      kcal: dayLogs.reduce((sum, l) => sum + l.kcal, 0),
      proteinG: dayLogs.reduce((sum, l) => sum + l.proteinG, 0),
      estimatedCount: dayLogs.filter((l) => l.estimated).length,
      isToday: localDate === today,
      isFuture: localDate > today,
    });
  }
  return out;
}

// ------------------------------------------------------------------ display

export function fmtKcal(kcal: number): string {
  return Math.round(kcal).toLocaleString('en-GB');
}

export function fmtGrams(g: number): string {
  return g >= 100 ? String(Math.round(g)) : String(Math.round(g * 10) / 10);
}

/** `150 g` / `2 huevos` / `1 pote`. */
export function fmtAmount(amount: number, unit: Food['refUnit'], portion?: Portion): string {
  if (portion && portion.amount > 0) {
    const count = amount / portion.amount;
    const rounded = Math.round(count * 100) / 100;
    return `${rounded} ${portion.label}${rounded === 1 ? '' : 's'}`;
  }
  const n = Math.round(amount * 10) / 10;
  return unit === 'unit' ? `${n}×` : `${n} ${unit}`;
}

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Entre horas',
};

/** Which meal a log at this hour most likely belongs to. */
export function guessMeal(at = Date.now()): MealSlot {
  const h = new Date(at).getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

// ------------------------------------------------------- the day's allowance

/**
 * What today can hold.
 *
 * With the weekly budget on this is *not* simply the daily target: it is the
 * week's remainder spread over the days still to come, so a heavy Sunday is
 * paid for by the days around it instead of being a day you failed. With it
 * off it is the flat daily target.
 */
export function dayAllowanceKcal(
  kcalTarget: number,
  budget: WeekBudget | null,
  weeklyBudgetEnabled: boolean,
): number {
  if (!weeklyBudgetEnabled || !budget || budget.perDayLeft === null) return kcalTarget;
  // Today's own intake stays out of this: it is what gets measured against the
  // allowance. Counting it here too made each bite shrink the day's allowance
  // by a seventh of itself, so a new target never showed up in full.
  const perDay = (budget.budgetKcal - budget.consumedBeforeTodayKcal) / (budget.daysLeft + 1);
  // A week already overspent would otherwise hand back a negative allowance and
  // every meal target with it. Floor it: the honest reading is "nothing left",
  // not "eat minus 300".
  return Math.max(0, perDay);
}

export interface MealPlan {
  meal: MealSlot;
  /** The meal's share of today's allowance, before anything is eaten. */
  targetKcal: number;
  consumedKcal: number;
  /** target − consumed. Negative means this meal went over its share. */
  remainingKcal: number;
  /**
   * What to actually aim for at this meal *now*, given what the day has
   * already cost. Meals already eaten report what they cost; the day's
   * remainder is divided among the ones still ahead, in proportion to their
   * shares. Overshooting lunch therefore shrinks dinner rather than quietly
   * blowing the day.
   */
  suggestedKcal: number;
  hasLogs: boolean;
}

export function planMeals(
  dayAllowance: number,
  split: Record<MealSlot, number>,
  logs: FoodLog[],
  order: readonly MealSlot[],
): MealPlan[] {
  const byMeal = macrosByMeal(logs);
  const consumedTotal = logs.reduce((sum, l) => sum + l.kcal, 0);
  const dayRemaining = Math.max(0, dayAllowance - consumedTotal);

  const pending = order.filter((m) => byMeal[m].kcal === 0);
  const pendingShare = pending.reduce((sum, m) => sum + (split[m] ?? 0), 0);

  return order.map((meal) => {
    const share = split[meal] ?? 0;
    const consumedKcal = byMeal[meal].kcal;
    const targetKcal = dayAllowance * share;
    const hasLogs = consumedKcal > 0;
    return {
      meal,
      targetKcal,
      consumedKcal,
      remainingKcal: targetKcal - consumedKcal,
      suggestedKcal: hasLogs
        ? consumedKcal
        : pendingShare > 0
          ? dayRemaining * (share / pendingShare)
          : 0,
      hasLogs,
    };
  });
}

/** Normalises a split back to 1 so the targets always add up to the day. */
export function normaliseSplit(
  split: Record<MealSlot, number>,
  order: readonly MealSlot[],
): Record<MealSlot, number> {
  const total = order.reduce((sum, m) => sum + Math.max(0, split[m] ?? 0), 0);
  if (total <= 0) {
    const even = 1 / order.length;
    return Object.fromEntries(order.map((m) => [m, even])) as Record<MealSlot, number>;
  }
  return Object.fromEntries(
    order.map((m) => [m, Math.max(0, split[m] ?? 0) / total]),
  ) as Record<MealSlot, number>;
}

// ----------------------------------------------------- estimated maintenance

/**
 * Energy in a kilo of body mass. The usual 7700 kcal/kg figure, which assumes
 * the change is mostly fat — fair over weeks, wrong over days, when what moves
 * is water and glycogen. That is why this only ever reads a span of weeks.
 */
const KCAL_PER_KG = 7700;

export interface MaintenanceEstimate {
  /** Null until there is enough data to say anything honest. */
  kcal: number | null;
  avgIntakeKcal: number;
  /** Negative while losing. From a fit over every weigh-in, not first-vs-last. */
  weightChangeKgPerWeek: number;
  spanDays: number;
  weighIns: number;
  loggedDays: number;
  /** Share of the span with any food logged. Low coverage poisons the average. */
  coverage: number;
  blocker: string | null;
}

const MIN_SPAN_DAYS = 14;
const MIN_WEIGH_INS = 4;
const MIN_COVERAGE = 0.7;

/**
 * Your actual maintenance, worked backwards from what you ate and what the
 * scale did. Beats any formula, because it is measured on you.
 *
 *     maintenance = what you ate + what the weight change says you were short
 *
 * Two things this refuses to do, both of which would produce a confident wrong
 * number:
 *
 *  - Average intake over *logged* days only. A day with no entries is a day you
 *    did not log, not a day you ate nothing; counting it as zero would drag the
 *    average down and inflate the estimate. Coverage is reported instead, and a
 *    patchy span is rejected outright.
 *  - Fit the weight trend over every weigh-in rather than comparing the first
 *    to the last. Day-to-day scale noise from water and glycogen is several
 *    times the weekly signal, so two endpoints can say anything.
 */
export function estimateMaintenance(
  logs: FoodLog[],
  weights: { localDate: string; weightKg?: number | null }[],
  today = todayLocalDate(),
  spanDays = 28,
): MaintenanceEstimate {
  const from = addDaysToLocalDate(today, -(spanDays - 1));

  const points = weights
    .filter((w) => w.weightKg != null && w.localDate >= from && w.localDate <= today)
    .map((w) => ({ x: daysBetween(from, w.localDate), y: w.weightKg as number }))
    .sort((a, b) => a.x - b.x);

  const empty: MaintenanceEstimate = {
    kcal: null,
    avgIntakeKcal: 0,
    weightChangeKgPerWeek: 0,
    spanDays: 0,
    weighIns: points.length,
    loggedDays: 0,
    coverage: 0,
    blocker: null,
  };

  if (points.length < MIN_WEIGH_INS) {
    return { ...empty, blocker: `Faltan pesajes: hay ${points.length}, hacen falta ${MIN_WEIGH_INS}.` };
  }

  // Everything below is measured over the window where *both* signals exist —
  // first weigh-in to last. Averaging intake over a wider window than the
  // weight trend covers would compare two different periods, and could even
  // report more logged days than the span is long.
  const spanFrom = addDaysToLocalDate(from, points[0].x);
  const spanTo = addDaysToLocalDate(from, points[points.length - 1].x);
  const spanCovered = points[points.length - 1].x - points[0].x + 1;

  const byDay = new Map<string, number>();
  for (const log of logs) {
    if (log.localDate >= spanFrom && log.localDate <= spanTo) {
      byDay.set(log.localDate, (byDay.get(log.localDate) ?? 0) + log.kcal);
    }
  }
  const loggedDays = byDay.size;
  const avgIntakeKcal =
    loggedDays > 0 ? [...byDay.values()].reduce((a, b) => a + b, 0) / loggedDays : 0;
  const coverage = spanCovered > 0 ? loggedDays / spanCovered : 0;

  const base: MaintenanceEstimate = {
    ...empty,
    avgIntakeKcal,
    spanDays: spanCovered,
    loggedDays,
    coverage,
  };

  if (spanCovered < MIN_SPAN_DAYS) {
    return {
      ...base,
      blocker: `El período es corto: ${spanCovered} días entre el primer y el último pesaje, hacen falta ${MIN_SPAN_DAYS}.`,
    };
  }
  if (coverage < MIN_COVERAGE) {
    return {
      ...base,
      blocker: `Registraste ${loggedDays} de ${spanCovered} días. Con menos del ${Math.round(
        MIN_COVERAGE * 100,
      )}% el promedio no representa lo que comiste.`,
    };
  }

  const slopeKgPerDay = linearSlope(points);
  const weightChangeKgPerWeek = slopeKgPerDay * 7;
  const kcal = avgIntakeKcal - slopeKgPerDay * KCAL_PER_KG;

  return { ...base, kcal, weightChangeKgPerWeek };
}

/** Least-squares slope of y over x. Zero when x never varies. */
function linearSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export interface WeekIntake {
  weekStartDate: string;
  avgKcal: number;
  loggedDays: number;
  avgWeightKg: number | null;
}

/** Weekly intake averages paired with that week's mean weight, oldest first. */
export function weeklyIntake(
  logs: FoodLog[],
  weights: { localDate: string; weightKg?: number | null }[],
  weekKeys: string[],
): WeekIntake[] {
  return weekKeys.map((key) => {
    const end = addDaysToLocalDate(key, 6);
    const days = new Map<string, number>();
    for (const l of logs) {
      if (l.localDate >= key && l.localDate <= end) {
        days.set(l.localDate, (days.get(l.localDate) ?? 0) + l.kcal);
      }
    }
    const weekWeights = weights
      .filter((w) => w.weightKg != null && w.localDate >= key && w.localDate <= end)
      .map((w) => w.weightKg as number);

    return {
      weekStartDate: key,
      avgKcal: days.size > 0 ? [...days.values()].reduce((a, b) => a + b, 0) / days.size : 0,
      loggedDays: days.size,
      avgWeightKg:
        weekWeights.length > 0
          ? weekWeights.reduce((a, b) => a + b, 0) / weekWeights.length
          : null,
    };
  });
}

/**
 * Free-text food matching.
 *
 * Every word has to appear somewhere in the name or brand, in any order, and
 * accents are folded away first. Matching the query as one contiguous string
 * meant "queso ricota" found nothing while "Ricota (entera)" sat right there,
 * and "brócoli" missed a library that spells it "Brocoli".
 */
const COMBINING = /[\u0300-\u036f]/g;

const fold = (s: string): string =>
  s.normalize('NFD').replace(COMBINING, '').toLowerCase();

export function matchesFood(food: { name: string; brand?: string }, query: string): boolean {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${food.name} ${food.brand ?? ''}`);
  return words.every((w) => hay.includes(w));
}
