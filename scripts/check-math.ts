import { solvePlates, formatPerSide } from '../src/lib/plates.ts';
import {
  epley1RM, paceOf, formatDuration, fmtKg, fmtKm,
  setLoad, loadLabel, loadLabelShort, topSet, bestE1RM, workoutVolume,
} from '../src/lib/calc.ts';
import type { WorkoutSet } from '../src/db/types.ts';
import { weekStart, localDateOf, recentWeeks, daysBetween } from '../src/lib/dates.ts';
import { MEAL_IDEAS, ideasFor, mealTarget, roundAmount, scaleIdea } from '../src/lib/mealIdeas.ts';
import { buildWeekBudget, dayAllowanceKcal } from '../src/lib/nutrition.ts';
import type { Food, FoodLog, FoodUnit } from '../src/db/types.ts';

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  ->  ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

const inv = [
  { weightKg: 25, pairs: 2 }, { weightKg: 20, pairs: 2 }, { weightKg: 15, pairs: 2 },
  { weightKg: 10, pairs: 2 }, { weightKg: 5, pairs: 2 }, { weightKg: 2.5, pairs: 2 },
  { weightKg: 1.25, pairs: 2 },
];

console.log('--- plates ---');
eq('100kg on 20kg bar', formatPerSide(solvePlates(100, 20, inv)), '1x25, 1x15');
eq('62.5kg float safety', formatPerSide(solvePlates(62.5, 20, inv)), '1x20, 1x1.25');
eq('62.5kg is exact', solvePlates(62.5, 20, inv).exact, true);
eq('bar only', formatPerSide(solvePlates(20, 20, inv)), 'Empty bar');
eq('below bar', solvePlates(15, 20, inv).problem, 'Below the 20 kg bar');
eq('220kg is reachable', solvePlates(220, 20, inv).exact, true);
eq('340kg exceeds the rack', solvePlates(340, 20, inv).exact, false);
eq('340kg falls back to max loadable', solvePlates(340, 20, inv).achievedKg, 335);
eq('odd target 101kg', solvePlates(101, 20, inv).exact, false);

console.log('--- calc ---');
eq('epley 100x5', Math.round(epley1RM(100, 5)! * 10) / 10, 116.7);
eq('epley single', epley1RM(140, 1), 140);
eq('epley capped at 13 reps', epley1RM(60, 13), null);
eq('epley zero reps', epley1RM(60, 0), null);
eq('pace 10km in 50min', paceOf(10, 3000), '5:00/km');
eq('pace 8km in 42:30', paceOf(8, 2550), '5:19/km');
eq('pace zero distance', paceOf(0, 600), '--');
eq('duration under hour', formatDuration(2550), '42:30');
eq('duration over hour', formatDuration(3764), '1:02:44');
eq('fmtKg integer', fmtKg(100), '100');
eq('fmtKg half', fmtKg(102.5), '102.5');
eq('fmtKm round', fmtKm(10), '10');
eq('fmtKm 100', fmtKm(100), '100');
eq('fmtKm decimal', fmtKm(5.25), '5.25');

console.log('--- bodyweight load ---');
const mkSet = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: over.id ?? 's', workoutId: 'w', exerciseId: 'e', setNumber: 1,
  weightKg: 0, reps: 8, setType: 'working', completedAt: 0, prTypes: [], ...over,
});
const bw = mkSet({ id: 'bw', weightKg: 0, reps: 8, bodyWeightKg: 78 });
const bwPlus = mkSet({ id: 'bw+', weightKg: 10, reps: 5, bodyWeightKg: 78 });
const barbell = mkSet({ id: 'bb', weightKg: 60, reps: 5 });
const noWeighIn = mkSet({ id: 'bw0', weightKg: 0, reps: 8, bodyWeightKg: 0 });

eq('pull-up carries bodyweight', setLoad(bw), 78);
eq('weighted pull-up adds to it', setLoad(bwPlus), 88);
eq('a loaded lift is unchanged', setLoad(barbell), 60);
eq('an unweighed bodyweight set is still zero', setLoad(noWeighIn), 0);
eq('bare bodyweight reads as a word', loadLabel(bw), { value: 'Bodyweight', unit: null });
eq('added weight reads as an increment', loadLabel(bwPlus), { value: 'BW +10', unit: 'kg' });
eq('a loaded lift reads as a number', loadLabel(barbell), { value: '60', unit: 'kg' });
eq('no weigh-in still reads as bodyweight', loadLabel(noWeighIn), { value: 'Bodyweight', unit: null });
eq('short label', loadLabelShort(bw), 'BW');
eq('short label with load', loadLabelShort(bwPlus), 'BW+10');
eq('volume counts the body', workoutVolume([bw]), 624);
eq('e1RM counts the body', Math.round(bestE1RM([bw])! * 10) / 10, 98.8);
eq('top set compares real load, not added', topSet([bw, barbell])!.id, 'bw');

console.log('--- dates ---');
eq('monday of a wednesday', weekStart('2026-08-26'), '2026-08-24');
eq('monday of a monday', weekStart('2026-08-24'), '2026-08-24');
eq('monday of a sunday', weekStart('2026-08-23'), '2026-08-17');
eq('late-night session keeps its own day', localDateOf(new Date(2026, 7, 26, 23, 40).getTime()), '2026-08-26');
eq('recentWeeks ends on current', recentWeeks(3, '2026-08-26').at(-1), '2026-08-24');
eq('recentWeeks length', recentWeeks(3, '2026-08-26').length, 3);
eq('daysBetween across month', daysBetween('2026-07-30', '2026-08-02'), 3);

console.log('--- meal ideas ---');
const mkFood = (
  slug: string, refAmount: number, refUnit: FoodUnit,
  kcal: number, proteinG: number, carbsG: number, fatG: number,
): Food => ({
  id: slug, name: slug, seedSlug: slug, refAmount, refUnit, kcal, proteinG, carbsG, fatG,
  fiberG: 0, portions: [], isFavorite: false, isArchived: false, useCount: 0, createdAt: 0, updatedAt: 0,
});
const lib = [
  mkFood('pechuga-pollo', 100, 'g', 120, 22.5, 0, 2.6),
  mkFood('arroz', 100, 'g', 365, 7.1, 80, 0.7),
  mkFood('brocoli', 100, 'g', 34, 2.8, 6.6, 0.4),
  mkFood('aceite-oliva', 100, 'g', 884, 0, 0, 100),
];
const bySlug = new Map(lib.map((f) => [f.seedSlug!, f]));
const lunchIdea = MEAL_IDEAS.find((i) => i.id === 'arroz-pollo-brocoli')!;
const lunch = scaleIdea(lunchIdea, bySlug, 840)!;
eq('scaled lunch lands near its target', Math.round(lunch.macros.kcal), 841);
eq('protein and carb scale', lunch.items.map((i) => i.amount), [250, 110, 150, 10]);
eq('vegetables and oil stay put', scaleIdea(lunchIdea, bySlug, 400)!.items.slice(2).map((i) => i.amount), [150, 10]);
eq('idea needing a missing food is dropped', scaleIdea(MEAL_IDEAS.find((i) => i.id === 'fideos-bolognesa')!, bySlug, 840), null);
eq('only buildable ideas are offered',
  ideasFor('lunch', lib, { kcal: 840, proteinG: 59, carbsG: 94, fatG: 24 }).map((i) => i.idea.id),
  ['arroz-pollo-brocoli']);
eq('eggs round to whole units', roundAmount(2.6, 'unit'), 3);
eq('never zero units', roundAmount(0.2, 'unit'), 1);
eq('small gram amounts round to 5', roundAmount(13, 'g'), 15);
eq('large gram amounts round to 10', roundAmount(117, 'g'), 120);
eq('meal gets its share of what is left',
  mealTarget(480, { proteinG: 170, carbsG: null, fatG: 70 }, { proteinG: 70, carbsG: 0, fatG: 30 }, 0.5),
  { kcal: 480, proteinG: 50, carbsG: null, fatG: 20 });
eq('a macro already covered leaves nothing, not a negative',
  mealTarget(300, { proteinG: 100, carbsG: 0, fatG: 0 }, { proteinG: 120, carbsG: 0, fatG: 0 }, 1).proteinG, 0);

console.log('--- day allowance ---');
const mkLog = (localDate: string, kcal: number) => ({ localDate, kcal, estimated: false }) as FoodLog;
const monday = '2026-09-14';
const mon = buildWeekBudget([mkLog(monday, 2095)], 2400, monday);
eq("today's intake does not shrink today's allowance", dayAllowanceKcal(2400, mon, true), 2400);
eq('a new target shows up in full the same day',
  dayAllowanceKcal(2000, buildWeekBudget([mkLog(monday, 2095)], 2000, monday), true), 2000);
eq('earlier days spread over the rest of the week',
  dayAllowanceKcal(2400, buildWeekBudget(
    [mkLog('2026-09-14', 2500), mkLog('2026-09-15', 2500), mkLog('2026-09-16', 1000)], 2400, '2026-09-16'), true),
  2360);
eq('budget off reads the flat target', dayAllowanceKcal(2400, mon, false), 2400);
eq('an overspent week floors at zero',
  dayAllowanceKcal(2400, buildWeekBudget([mkLog(monday, 17000)], 2400, '2026-09-15'), true), 0);

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
