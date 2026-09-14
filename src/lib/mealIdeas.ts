/**
 * Balanced meal ideas, sized to what is left for one meal.
 *
 * Each idea is a plate built the way a balanced meal is: a protein, a carb
 * (whole grain, legume or tuber where it fits), vegetables or fruit, and a
 * little fat. Only the protein and carb portions scale to the meal's target.
 * The vegetables stay put: cutting them saves almost nothing and costs the
 * fibre.
 *
 * Type imports only, so scripts/check-math.ts can load this file in Node.
 */
import type { Food, FoodUnit, MealSlot } from '../db/types';
import type { Macros } from './nutrition';

export interface IdeaItem {
  /** A seed food's `seedSlug`, so ideas follow the library's own values. */
  slug: string;
  amount: number;
  scales?: boolean;
}

export interface MealIdea {
  id: string;
  meal: MealSlot;
  name: string;
  why: string;
  items: IdeaItem[];
}

export const MEAL_IDEAS: MealIdea[] = [
  // ---------------------------------------------------------------- breakfast
  {
    id: 'avena-banana-batido',
    meal: 'breakfast',
    name: 'Avena con banana y batido',
    why: 'Carbohidrato lento y más de 30 g de proteína: llegás al almuerzo sin hambre.',
    items: [
      { slug: 'avena', amount: 50, scales: true },
      { slug: 'banana', amount: 1 },
      { slug: 'batido-proteina-leche-descremada', amount: 1 },
    ],
  },
  {
    id: 'tostadas-huevos-palta',
    meal: 'breakfast',
    name: 'Tostadas integrales con huevos y palta',
    why: 'Proteína completa del huevo, grasa buena y fibra de la palta.',
    items: [
      { slug: 'pan-integral', amount: 2, scales: true },
      { slug: 'huevo', amount: 2, scales: true },
      { slug: 'palta', amount: 40 },
      { slug: 'tomate', amount: 100 },
    ],
  },
  {
    id: 'yogur-avena-manzana',
    meal: 'breakfast',
    name: 'Yogur griego con avena, manzana y almendras',
    why: 'Lácteo, cereal, fruta y fruto seco: el desayuno completo en un bowl.',
    items: [
      { slug: 'yogur-griego-natural', amount: 1 },
      { slug: 'proteina-star', amount: 15 },
      { slug: 'avena', amount: 40, scales: true },
      { slug: 'manzana', amount: 1 },
      { slug: 'almendras', amount: 15 },
    ],
  },

  // -------------------------------------------------------------------- lunch
  {
    id: 'arroz-pollo-brocoli',
    meal: 'lunch',
    name: 'Arroz con pollo, brócoli y oliva',
    why: 'El plato de manual: proteína magra, carbohidrato para entrenar y verdura.',
    items: [
      { slug: 'pechuga-pollo', amount: 200, scales: true },
      { slug: 'arroz', amount: 90, scales: true },
      { slug: 'brocoli', amount: 150 },
      { slug: 'aceite-oliva', amount: 10 },
    ],
  },
  {
    id: 'fideos-bolognesa',
    meal: 'lunch',
    name: 'Fideos con salsa bolognesa',
    why: 'Carne magra y tomate: hierro y licopeno en un plato que se come con ganas.',
    items: [
      { slug: 'fideos', amount: 100, scales: true },
      { slug: 'carne-picada', amount: 150, scales: true },
      { slug: 'tomate', amount: 150 },
      { slug: 'cebolla', amount: 50 },
      { slug: 'parmesano', amount: 10 },
    ],
  },
  {
    id: 'nalga-papa-ensalada',
    meal: 'lunch',
    name: 'Bife de nalga con papas y ensalada',
    why: 'Corte magro: mucha proteína por caloría, y la papa trae potasio.',
    items: [
      { slug: 'nalga', amount: 200, scales: true },
      { slug: 'papa', amount: 300, scales: true },
      { slug: 'lechuga', amount: 80 },
      { slug: 'tomate', amount: 150 },
      { slug: 'aceite-oliva', amount: 10 },
    ],
  },
  {
    id: 'lentejas-arroz-huevo',
    meal: 'lunch',
    name: 'Guiso de lentejas con arroz y huevo',
    why: 'Legumbre más cereal: proteína completa y la fibra de medio día.',
    items: [
      { slug: 'lentejas', amount: 70, scales: true },
      { slug: 'arroz', amount: 60, scales: true },
      { slug: 'huevo', amount: 2 },
      { slug: 'zanahoria', amount: 80 },
      { slug: 'cebolla', amount: 50 },
      { slug: 'aceite-oliva', amount: 5 },
    ],
  },

  // -------------------------------------------------------------------- snack
  {
    id: 'batido-banana',
    meal: 'snack',
    name: 'Batido de proteína con banana',
    why: 'Rápido y con 35 g de proteína: ideal cerca del entrenamiento.',
    items: [
      { slug: 'batido-proteina-leche-protein', amount: 1 },
      { slug: 'banana', amount: 1, scales: true },
    ],
  },
  {
    id: 'yogur-manzana-almendras',
    meal: 'snack',
    name: 'Yogur con proteína, manzana y almendras',
    why: 'Fruta y fruto seco suman fibra y grasa buena a la proteína.',
    items: [
      { slug: 'yogur-firme-descremado', amount: 1 },
      { slug: 'proteina-star', amount: 15, scales: true },
      { slug: 'manzana', amount: 1 },
      { slug: 'almendras', amount: 20 },
    ],
  },
  {
    id: 'tostadas-jamon-queso',
    meal: 'snack',
    name: 'Tostadas integrales con jamón y queso untable',
    why: 'Salado y con proteína, sin pasarte de grasa.',
    items: [
      { slug: 'pan-integral', amount: 2, scales: true },
      { slug: 'jamon-cocido', amount: 2, scales: true },
      { slug: 'queso-untable-light', amount: 30 },
      { slug: 'tomate', amount: 100 },
    ],
  },

  // ------------------------------------------------------------------- dinner
  {
    id: 'salmon-batata-brocoli',
    meal: 'dinner',
    name: 'Salmón con batata y brócoli',
    why: 'Omega 3 del salmón; batata y brócoli suman fibra y vitaminas.',
    items: [
      { slug: 'salmon', amount: 150, scales: true },
      { slug: 'batata', amount: 250, scales: true },
      { slug: 'brocoli', amount: 150 },
    ],
  },
  {
    id: 'milanesa-pollo-ensalada',
    meal: 'dinner',
    name: 'Milanesa de pollo al horno con papas y ensalada',
    why: 'Al horno en vez de frita: la misma milanesa con 70 kcal menos.',
    items: [
      { slug: 'milanesa-pollo-horno', amount: 1, scales: true },
      { slug: 'papa', amount: 200, scales: true },
      { slug: 'lechuga', amount: 80 },
      { slug: 'tomate', amount: 150 },
      { slug: 'aceite-oliva', amount: 5 },
    ],
  },
  {
    id: 'atun-arroz-ensalada',
    meal: 'dinner',
    name: 'Ensalada completa de atún, arroz y huevo',
    why: 'Liviana para la noche y con mucha proteína.',
    items: [
      { slug: 'atun-agua', amount: 1, scales: true },
      { slug: 'arroz', amount: 70, scales: true },
      { slug: 'huevo', amount: 1 },
      { slug: 'tomate', amount: 150 },
      { slug: 'lechuga', amount: 80 },
      { slug: 'aceite-oliva', amount: 10 },
    ],
  },
];

/** Past these the plate is a different meal, not a resized one. */
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2.5;

export interface ResolvedItem {
  food: Food;
  amount: number;
  macros: Macros;
}

export interface ScaledIdea {
  idea: MealIdea;
  items: ResolvedItem[];
  macros: Macros;
  /** Lower fits the meal's target better. */
  score: number;
}

/** What is left for one meal. A null macro means no daily target is set. */
export interface MealTarget {
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

function macrosOf(food: Food, amount: number): Macros {
  const f = food.refAmount > 0 ? amount / food.refAmount : 0;
  return {
    kcal: food.kcal * f,
    proteinG: food.proteinG * f,
    carbsG: food.carbsG * f,
    fatG: food.fatG * f,
    fiberG: (food.fiberG ?? 0) * f,
  };
}

function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
      fiberG: a.fiberG + m.fiberG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

/** Amounts you can actually portion: whole eggs, grams in fives or tens. */
export function roundAmount(amount: number, unit: FoodUnit): number {
  if (unit === 'unit') return Math.max(1, Math.round(amount));
  const step = amount >= 100 ? 10 : 5;
  return Math.max(step, Math.round(amount / step) * step);
}

/** Null when the library is missing, or has archived, one of the idea's foods. */
export function scaleIdea(
  idea: MealIdea,
  foodsBySlug: Map<string, Food>,
  targetKcal: number,
): Omit<ScaledIdea, 'score'> | null {
  const resolved: { item: IdeaItem; food: Food }[] = [];
  for (const item of idea.items) {
    const food = foodsBySlug.get(item.slug);
    if (!food) return null;
    resolved.push({ item, food });
  }

  let fixed = 0;
  let scalable = 0;
  for (const { item, food } of resolved) {
    const kcal = macrosOf(food, item.amount).kcal;
    if (item.scales) scalable += kcal;
    else fixed += kcal;
  }
  const factor =
    scalable > 0
      ? Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, (targetKcal - fixed) / scalable))
      : 1;

  const items = resolved.map(({ item, food }) => {
    const amount = roundAmount(item.scales ? item.amount * factor : item.amount, food.refUnit);
    return { food, amount, macros: macrosOf(food, amount) };
  });
  return { idea, items, macros: sumMacros(items.map((i) => i.macros)) };
}

/**
 * The meal's share of what the day still has, macro by macro — the same
 * split `planMeals` applies to calories. `share` is this meal's fraction of
 * the meals not eaten yet.
 */
export function mealTarget(
  kcal: number,
  daily: { proteinG?: number | null; carbsG?: number | null; fatG?: number | null },
  eaten: Pick<Macros, 'proteinG' | 'carbsG' | 'fatG'>,
  share: number,
): MealTarget {
  const part = (target: number | null | undefined, done: number) =>
    target ? Math.max(0, target - done) * share : null;
  return {
    kcal,
    proteinG: part(daily.proteinG, eaten.proteinG),
    carbsG: part(daily.carbsG, eaten.carbsG),
    fatG: part(daily.fatG, eaten.fatG),
  };
}

/**
 * How far a plate lands from the target. Protein counts most, and running
 * short of it costs far more than going over: in a deficit, extra protein is
 * the macro that protects muscle.
 */
export function fitScore(m: Macros, t: MealTarget): number {
  const rel = (a: number, b: number, floor: number) => Math.abs(a - b) / Math.max(b, floor);
  let score = rel(m.kcal, t.kcal, 100);
  if (t.proteinG !== null) {
    const short = t.proteinG - m.proteinG;
    score += (short > 0 ? 1.5 : 0.2) * (Math.abs(short) / Math.max(t.proteinG, 10));
  }
  if (t.carbsG !== null) score += 0.5 * rel(m.carbsG, t.carbsG, 10);
  if (t.fatG !== null) score += 0.5 * rel(m.fatG, t.fatG, 5);
  return score;
}

/** Every idea for the meal the library can build, best fit first. */
export function ideasFor(meal: MealSlot, foods: Food[], target: MealTarget): ScaledIdea[] {
  const bySlug = new Map<string, Food>();
  for (const f of foods) if (f.seedSlug && !f.isArchived) bySlug.set(f.seedSlug, f);

  const out: ScaledIdea[] = [];
  for (const idea of MEAL_IDEAS) {
    if (idea.meal !== meal) continue;
    const scaled = scaleIdea(idea, bySlug, target.kcal);
    if (scaled) out.push({ ...scaled, score: fitScore(scaled.macros, target) });
  }
  return out.sort((a, b) => a.score - b.score);
}

const BASE_TIP: Record<MealSlot, string> = {
  breakfast:
    'Proteína desde el desayuno: repartida en el día le rinde más al músculo que juntada a la noche.',
  lunch: 'Medio plato de verdura, un cuarto de proteína y un cuarto de carbohidrato.',
  snack: 'Si entrenás a la tarde, acá va el carbohidrato; si no, fruta y proteína.',
  dinner: 'Verdura en cantidad: llena, suma fibra y casi no suma calorías.',
};

/** Advice for this meal given how the day has gone, most pressing first. */
export function mealTips(meal: MealSlot, t: MealTarget): string[] {
  const tips: string[] = [];
  if (t.kcal < 150) {
    tips.push('Queda poco del día: si tenés hambre, verdura y proteína magra, que suman poco.');
  } else {
    // Over ~35% of the meal's energy as protein means the day is running behind on it.
    if (t.proteinG !== null && t.proteinG * 4 > t.kcal * 0.35) {
      tips.push(
        `Te faltan ${Math.round(t.proteinG)} g de proteína para esta comida: elegí el plato con más proteína o sumá un batido.`,
      );
    }
    if (t.fatG !== null && t.fatG < 8) {
      tips.push('Te queda poca grasa: cociná sin aceite y salteá quesos y palta.');
    }
  }
  tips.push(BASE_TIP[meal]);
  return tips;
}
