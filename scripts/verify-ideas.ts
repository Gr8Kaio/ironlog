/**
 * Ranks the lunch ideas against a real library, with and without the
 * familiarity term, so the weight can be judged rather than guessed.
 *
 *   node --experimental-strip-types scripts/verify-ideas.ts <backup.json> [meal]
 */
import { readFileSync } from 'node:fs';
import {
  eatenStems,
  familiarityPenalty,
  fitScore,
  ideasFor,
  scaleIdea,
  MEAL_IDEAS,
} from '../src/lib/mealIdeas.ts';
import type { Food, MealSlot } from '../src/db/types.ts';

const backup = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  foods: Food[];
  foodLogs: { name: string; loggedAt: number }[];
};
const eaten = eatenStems(backup.foodLogs);
const NOW = Math.max(...backup.foodLogs.map((l) => l.loggedAt));
const meal = (process.argv[3] ?? 'lunch') as MealSlot;
const target = { kcal: 758, proteinG: 75, carbsG: 121, fatG: 27 };

const bySlug = new Map<string, Food>();
for (const f of backup.foods) if (f.seedSlug && !f.isArchived) bySlug.set(f.seedSlug, f);

const rows = [];
for (const idea of MEAL_IDEAS) {
  if (idea.meal !== meal) continue;
  const scaled = scaleIdea(idea, bySlug, target.kcal);
  if (!scaled) continue;
  const scales = new Map(idea.items.map((i) => [i.slug, i.scales === true]));
  const anchored = scaled.items.map((i) => ({
    food: i.food,
    scales: scales.get(i.food.seedSlug ?? '') ?? false,
  }));
  const fit = fitScore(scaled.macros, target);
  const fam = familiarityPenalty(anchored, eaten, NOW);
  rows.push({
    id: idea.id,
    fit: fit.toFixed(3),
    fam: fam.toFixed(3),
    total: (fit + fam).toFixed(3),
    anchors: anchored
      .filter((a) => a.scales)
      .map((a) => `${a.food.seedSlug}:${a.food.useCount ?? 0}`)
      .join(' '),
  });
}

rows.sort((a, b) => Number(a.total) - Number(b.total));
console.log(`${meal} — orden final (fit + familiaridad)\n`);
for (const r of rows) {
  console.log(`${r.total}  (fit ${r.fit} + fam ${r.fam})  ${r.id.padEnd(30)} ${r.anchors}`);
}

console.log('\nsolo por fit, para comparar:');
for (const r of [...rows].sort((a, b) => Number(a.fit) - Number(b.fit))) {
  console.log(`${r.fit}  ${r.id}`);
}

console.log('\nlo que devuelve ideasFor:');
console.log(
  ideasFor(meal, backup.foods, target, undefined, eaten, NOW)
    .map((i) => i.idea.id)
    .join('\n'),
);
