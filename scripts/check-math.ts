import { solvePlates, formatPerSide } from '../src/lib/plates.ts';
import { epley1RM, paceOf, formatDuration, fmtKg, fmtKm } from '../src/lib/calc.ts';
import { weekStart, localDateOf, recentWeeks, daysBetween } from '../src/lib/dates.ts';

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

console.log('--- dates ---');
eq('monday of a wednesday', weekStart('2026-08-26'), '2026-08-24');
eq('monday of a monday', weekStart('2026-08-24'), '2026-08-24');
eq('monday of a sunday', weekStart('2026-08-23'), '2026-08-17');
eq('late-night session keeps its own day', localDateOf(new Date(2026, 7, 26, 23, 40).getTime()), '2026-08-26');
eq('recentWeeks ends on current', recentWeeks(3, '2026-08-26').at(-1), '2026-08-24');
eq('recentWeeks length', recentWeeks(3, '2026-08-26').length, 3);
eq('daysBetween across month', daysBetween('2026-07-30', '2026-08-02'), 3);

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
