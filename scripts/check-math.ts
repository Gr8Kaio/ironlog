import { solvePlates, formatPerSide } from '../src/lib/plates.ts';
import {
  epley1RM, paceOf, formatDuration, fmtKg, fmtKm,
  setLoad, loadLabel, loadLabelShort, topSet, bestE1RM, workoutVolume,
} from '../src/lib/calc.ts';
import type { WorkoutSet } from '../src/db/types.ts';
import { weekStart, localDateOf, recentWeeks, daysBetween, addDaysToLocalDate } from '../src/lib/dates.ts';
import { MEAL_IDEAS, ideasFor, mealTarget, roundAmount, scaleIdea, tiltTarget } from '../src/lib/mealIdeas.ts';
import {
  buildWeekBudget, dayAllowanceKcal, estimateMaintenance, resolveWeek, weeklyIntake,
} from '../src/lib/nutrition.ts';
import {
  applyOverride, phaseBadge, phasePenalty, trainingContext, type TrainingSession,
} from '../src/lib/trainingFuel.ts';
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

console.log('--- days you did not log ---');
const week = [mkLog('2026-09-14', 2600), mkLog('2026-09-15', 400), mkLog('2026-09-17', 2500)];
const assume = { kcal: 2900, targetKcal: 2400, since: '2026-09-14' };
const resolved = resolveWeek(week, '2026-09-18', assume);
const mark = (d: (typeof resolved)[number]) =>
  `${Math.round(d.kcal)}${d.assumed ? '*' : ''}`;
eq('empty and half-logged past days are filled, today never is',
  resolved.map(mark), ['2600', '2900*', '2900*', '2500', '0', '0', '0']);
eq('a full day is left exactly as logged', resolved[0].loggedKcal, 2600);
eq('the log is still readable under an assumed day', resolved[1].loggedKcal, 400);
eq('an assumption never lowers a day',
  resolveWeek([mkLog('2026-09-14', 3400)], '2026-09-18', assume)[0].kcal, 3400);
eq('a day ruled logged is left alone',
  resolveWeek(week, '2026-09-18', {
    ...assume,
    overrides: new Map([['2026-09-15', { localDate: '2026-09-15', mode: 'logged' as const, updatedAt: 0 }]]),
  })[1].kcal, 400);
eq('nothing before your first ever log is assumed',
  resolveWeek(week, '2026-09-18', { ...assume, since: '2026-09-17' }).map(mark),
  ['2600', '400', '0', '2500', '0', '0', '0']);
eq('the budget counts the assumption',
  Math.round(buildWeekBudget(week, 2400, '2026-09-18', assume).consumedKcal), 10900);
eq('and says how much of it was assumed',
  Math.round(buildWeekBudget(week, 2400, '2026-09-18', assume).assumedKcal), 5400);
eq('the weekly average splits logged from assumed',
  (() => {
    const w = weeklyIntake(week, [], ['2026-09-14'], '2026-09-18', assume)[0];
    return [Math.round(w.avgKcal), Math.round(w.avgLoggedKcal), w.loggedDays, w.assumedDays];
  })(),
  [2725, 1375, 3, 2]);

console.log('--- maintenance ---');
const weighIns = ['2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17'].map((localDate, i) => ({
  localDate, weightKg: 90 - i * 0.5,
}));
const fed = Array.from({ length: 22 }, (_, i) => mkLog(addDaysToLocalDate('2026-08-27', i), 2400));
const solid = estimateMaintenance(fed, weighIns, '2026-09-18', 28);
eq('a clean month gives a number', Math.round(solid.kcal ?? 0), 2950);
eq('and the trend it rests on', Math.round(solid.weightChangeKgPerWeek * 100) / 100, -0.5);
const gappy = estimateMaintenance(fed.slice(0, 6), weighIns, '2026-09-18', 28);
eq('a patchy month gives none', gappy.kcal, null);
eq('but still reports the trend', Math.round(gappy.weightChangeKgPerWeek * 100) / 100, -0.5);
eq('too much assumption blocks the number',
  estimateMaintenance(fed.slice(0, 6), weighIns, '2026-09-18', 28, {
    kcal: 2900, targetKcal: 2400, since: '2026-08-27',
  }).kcal,
  null);

console.log('--- training phase ---');
const at = (localDate: string, h: number, m = 0) =>
  new Date(`${localDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();

// Six Tuesdays in a row at 18:00, so Tuesday is unmistakably a training day.
const tuesdays = ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08'];
const habit: TrainingSession[] = tuesdays.map((d) => ({
  kind: 'workout', localDate: d, startedAt: at(d, 18), finishedAt: at(d, 19, 30), inProgress: false,
}));
const tue = '2026-09-15';

eq('a usual training day with nothing logged yet reads as pre-workout',
  trainingContext(habit, tue, at(tue, 13), tue).phase, 'pre');
eq('and says how long until the usual hour',
  trainingContext(habit, tue, at(tue, 16, 30), tue).untilMin, 90);
eq('long past the usual hour the session did not happen',
  trainingContext(habit, tue, at(tue, 23), tue).phase, 'rest');

const trainedToday: TrainingSession[] = [
  ...habit,
  { kind: 'workout', localDate: tue, startedAt: at(tue, 18), finishedAt: at(tue, 19, 30), inProgress: false },
];
eq('an hour after the last set is the recovery meal',
  trainingContext(trainedToday, tue, at(tue, 20, 30), tue).phase, 'post');
eq('five hours later it is just a day you trained',
  trainingContext(trainedToday, tue, at(tue, 23, 59), tue).phase, 'trained');
eq('a session still open reads as mid-workout',
  trainingContext(
    [{ kind: 'workout', localDate: tue, startedAt: at(tue, 18), finishedAt: null, inProgress: true }],
    tue, at(tue, 18, 40), tue).phase, 'during');
eq('a run counts as training too',
  trainingContext(
    [{ kind: 'run', localDate: tue, startedAt: at(tue, 7), finishedAt: at(tue, 7, 45), inProgress: false }],
    tue, at(tue, 9), tue).kind, 'run');

// Sundays are never trained in the fixture, so Sunday is a rest day.
eq('a day you never train is never pre-workout',
  trainingContext(habit, '2026-09-13', at('2026-09-13', 13), '2026-09-13').phase, 'rest');
eq('a past day is read from its own logs, never guessed',
  trainingContext(habit, '2026-09-08', at(tue, 13), tue).phase, 'trained');
eq('a past day with nothing logged is not pre-workout',
  trainingContext(habit, '2026-09-09', at(tue, 13), tue).phase, 'rest');
eq('no history at all says nothing', trainingContext([], tue, at(tue, 13), tue).phase, 'rest');

eq('your word overrides the guess',
  applyOverride(trainingContext(habit, '2026-09-13', at('2026-09-13', 13), '2026-09-13'), 'pre').phase, 'pre');
eq('an override is marked as declared',
  applyOverride(trainingContext(habit, tue, at(tue, 13), tue), 'rest').declared, true);
eq('auto leaves the reading alone',
  applyOverride(trainingContext(habit, tue, at(tue, 13), tue), 'auto').phase, 'pre');

eq('a session logged for later today is a plan, not a session you recovered from',
  trainingContext(
    [{ kind: 'workout', localDate: tue, startedAt: at(tue, 18), finishedAt: at(tue, 19, 30), inProgress: false }],
    tue, at(tue, 13), tue).phase, 'pre');
eq('and it times the wait off the session itself, not the habit',
  trainingContext(
    [{ kind: 'workout', localDate: tue, startedAt: at(tue, 18), finishedAt: at(tue, 19, 30), inProgress: false }],
    tue, at(tue, 17), tue).untilMin, 60);
eq('a session under way but not flagged open still reads as mid-workout',
  trainingContext(
    [{ kind: 'workout', localDate: tue, startedAt: at(tue, 18), finishedAt: at(tue, 19, 30), inProgress: false }],
    tue, at(tue, 18, 45), tue).phase, 'during');

console.log('--- target tilt ---');
const flat = { kcal: 700, proteinG: 45, carbsG: 80, fatG: 20 };
const round = (t: ReturnType<typeof tiltTarget>) =>
  [Math.round(t.kcal), Math.round(t.proteinG!), Math.round(t.carbsG!), Math.round(t.fatG!)];

eq('before training the same calories lean on carbohydrate', round(tiltTarget(flat, 'pre')), [700, 45, 94, 16]);
eq('on a rest day they lean away from it', round(tiltTarget(flat, 'rest')), [700, 45, 72, 26]);
eq('a day you already trained is left alone', round(tiltTarget(flat, 'trained')), [700, 45, 80, 20]);
eq('protein never moves', tiltTarget(flat, 'pre').proteinG, 45);
eq('calories never move', tiltTarget(flat, 'rest').kcal, 700);
eq('a tilt cannot invent macros that were never targeted',
  tiltTarget({ kcal: 700, proteinG: 45, carbsG: null, fatG: null }, 'pre').carbsG, null);
eq('a meal whose protein alone fills it is left alone',
  round(tiltTarget({ kcal: 200, proteinG: 60, carbsG: 10, fatG: 5 }, 'pre')), [200, 60, 10, 5]);

console.log('--- phase fit ---');
const plate = (kcal: number, proteinG: number, carbsG: number, fatG: number, fiberG = 0) =>
  ({ kcal, proteinG, carbsG, fatG, fiberG });
// Rice, banana and whey: high carbohydrate, almost no fat.
const carby = plate(600, 35, 95, 6, 4);
// Steak and avocado: the same calories carried by protein and fat.
const fatty = plate(600, 40, 12, 40, 6);

eq('before training the carbohydrate plate wins',
  phasePenalty(carby, 'pre') < phasePenalty(fatty, 'pre'), true);
eq('and the carbohydrate plate takes no penalty at all',
  Math.round(phasePenalty(carby, 'pre') * 100) / 100, 0);
eq('after training the same plate still wins',
  phasePenalty(carby, 'post') < phasePenalty(fatty, 'post'), true);
eq('on a rest day the fatty, high-protein plate is judged less harshly',
  phasePenalty(fatty, 'rest') < phasePenalty(fatty, 'pre'), true);
eq('a plate that suits the moment gets a badge', phaseBadge(carby, 'pre'), 'entra liviano');
eq('one that does not gets none', phaseBadge(fatty, 'pre'), null);
// Mince and pasta: a fine pre-workout plate, but not one built for it.
const middling = plate(980, 65, 116, 26, 7);
eq('a badge is stricter than a clean penalty', phasePenalty(middling, 'pre'), 0);
eq('so a merely acceptable plate is not badged', phaseBadge(middling, 'pre'), null);

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
