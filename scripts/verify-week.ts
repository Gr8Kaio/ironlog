/**
 * Reads a real backup and prints what the week view will now say about it.
 * Not part of `npm run check` — it needs a file that is not in the repo.
 *
 *   node --experimental-strip-types scripts/verify-week.ts <backup.json>
 */
import { readFileSync } from 'node:fs';
import { buildWeekBudget, fmtKcal, resolveWeek } from '../src/lib/nutrition.ts';
import type { FoodLog } from '../src/db/types.ts';

const path = process.argv[2];
if (!path) throw new Error('Pass the path to a backup JSON.');

const backup = JSON.parse(readFileSync(path, 'utf8')) as {
  foodLogs: FoodLog[];
  settings: { kcalTarget: number; assumedDayKcal?: number | null };
};

const today = process.argv[3] ?? '2026-09-23';
const target = backup.settings.kcalTarget;
const firstLog = backup.foodLogs.map((l) => l.localDate).sort()[0] ?? null;
const assumption = {
  kcal: backup.settings.assumedDayKcal ?? 2900,
  targetKcal: target,
  since: firstLog,
};

const days = resolveWeek(backup.foodLogs, today, assumption);
const budget = buildWeekBudget(backup.foodLogs, target, today, assumption);

console.log(`objetivo ${target} kcal/día · asumido ${assumption.kcal} kcal · hoy ${today}\n`);
for (const day of days) {
  const mark = day.isFuture ? 'futuro' : day.isToday ? 'hoy' : day.assumed ? 'ASUMIDO' : 'anotado';
  console.log(
    `${day.localDate}  cuenta ${String(Math.round(day.kcal)).padStart(5)}  ` +
      `anotado ${String(Math.round(day.loggedKcal)).padStart(5)}  ${mark}`,
  );
}
console.log(
  `\npresupuesto ${fmtKcal(budget.budgetKcal)} · consumido ${fmtKcal(budget.consumedKcal)}` +
    ` (${fmtKcal(budget.assumedKcal)} asumidas)` +
    `\nqueda ${fmtKcal(budget.remainingKcal)} para ${budget.daysLeft + 1} días` +
    ` = ${fmtKcal(budget.perDayLeft ?? 0)}/día` +
    `\ndrift ${budget.driftKcal < 0 ? 'adelante' : 'atrás'} ${fmtKcal(Math.abs(budget.driftKcal))}`,
);
