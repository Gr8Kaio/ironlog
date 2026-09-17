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
import { phasePenalty, type TrainingPhase } from './trainingFuel.ts';

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
      { slug: 'banana', amount: 120 },
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
      { slug: 'manzana', amount: 180 },
      { slug: 'almendras', amount: 15 },
    ],
  },

  {
    id: 'avena-miel-batido',
    meal: 'breakfast',
    name: 'Avena con miel y batido',
    why: 'Casi todo carbohidrato y muy poca grasa: se digiere rápido y no te pesa al entrenar.',
    items: [
      { slug: 'avena', amount: 60, scales: true },
      { slug: 'miel', amount: 20 },
      { slug: 'batido-proteina-leche-descremada', amount: 1 },
    ],
  },
  {
    id: 'tostadas-banana-batido',
    meal: 'breakfast',
    name: 'Tostadas con banana, miel y batido',
    why: 'Carbohidrato rápido con proteína al lado: repone y repara sin grasa que frene la digestión.',
    items: [
      { slug: 'pan-integral', amount: 3, scales: true },
      { slug: 'banana', amount: 120 },
      { slug: 'miel', amount: 15 },
      { slug: 'batido-proteina-leche-descremada', amount: 1 },
    ],
  },
  {
    id: 'ricota-avena-nueces',
    meal: 'breakfast',
    name: 'Ricota semi con avena, manzana y nueces',
    why: 'Mucha proteína y poco carbohidrato: sostiene la mañana en un día sin entrenar.',
    items: [
      { slug: 'ricota-semi', amount: 150, scales: true },
      { slug: 'avena', amount: 30, scales: true },
      { slug: 'manzana', amount: 180 },
      { slug: 'nueces', amount: 15 },
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

  {
    id: 'pollo-arroz-zanahoria',
    meal: 'lunch',
    name: 'Pollo con arroz y zanahoria, sin aceite',
    why: 'Plato liviano y alto en carbohidrato: comés dos horas antes y entrenás sin sentirlo.',
    items: [
      { slug: 'pechuga-pollo', amount: 150, scales: true },
      { slug: 'arroz', amount: 120, scales: true },
      { slug: 'zanahoria', amount: 100 },
    ],
  },
  {
    id: 'atun-arroz-tomate',
    meal: 'lunch',
    name: 'Arroz con atún al agua y tomate',
    why: 'Proteína y carbohidrato sin casi grasa: la combinación que repone glucógeno más rápido.',
    items: [
      { slug: 'atun-agua', amount: 2, scales: true },
      { slug: 'arroz', amount: 110, scales: true },
      { slug: 'tomate', amount: 150 },
    ],
  },
  {
    id: 'garbanzos-pollo-ensalada',
    meal: 'lunch',
    name: 'Ensalada de garbanzos con pollo',
    why: 'Toda la fibra del día en un plato: llena mucho para las calorías que trae.',
    items: [
      { slug: 'garbanzos', amount: 60, scales: true },
      { slug: 'pechuga-pollo', amount: 150, scales: true },
      { slug: 'lechuga', amount: 80 },
      { slug: 'tomate', amount: 150 },
      { slug: 'zanahoria', amount: 80 },
      { slug: 'aceite-oliva', amount: 10 },
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
      { slug: 'banana', amount: 120, scales: true },
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
      { slug: 'manzana', amount: 180 },
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

  {
    id: 'banana-miel-batido',
    meal: 'snack',
    name: 'Banana con miel y batido',
    why: 'Azúcar de fácil digestión y proteína: lo que entra bien media hora antes de la barra.',
    items: [
      { slug: 'banana', amount: 120, scales: true },
      { slug: 'miel', amount: 15 },
      { slug: 'batido-proteina-leche-descremada', amount: 1 },
    ],
  },
  {
    id: 'batido-avena-banana',
    meal: 'snack',
    name: 'Batido con avena y banana',
    why: 'Proteína y carbohidrato líquidos: se toman apenas terminás, cuando comer sólido no entra.',
    items: [
      { slug: 'batido-proteina-leche-protein', amount: 1 },
      { slug: 'avena', amount: 40, scales: true },
      { slug: 'banana', amount: 120 },
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
  {
    id: 'pollo-horno-papa-ensalada',
    meal: 'dinner',
    name: 'Pollo al horno con papa y ensalada',
    why: 'Proteína y carbohidrato en cantidad para cerrar el día en que entrenaste.',
    items: [
      { slug: 'pollo-horno', amount: 180, scales: true },
      { slug: 'papa', amount: 250, scales: true },
      { slug: 'tomate', amount: 150 },
      { slug: 'lechuga', amount: 80 },
    ],
  },
  {
    id: 'tortilla-brocoli-ensalada',
    meal: 'dinner',
    name: 'Tortilla de huevo con brócoli y ensalada',
    why: 'Mucha proteína y mucha verdura con poco carbohidrato: llena sin gastar el día.',
    items: [
      { slug: 'huevo', amount: 3, scales: true },
      { slug: 'brocoli', amount: 200 },
      { slug: 'lechuga', amount: 80 },
      { slug: 'tomate', amount: 150 },
      { slug: 'aceite-oliva', amount: 5 },
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
 * The same calories, in the shape the moment calls for.
 *
 * Protein is left exactly where it was — it is the macro with a floor, and no
 * amount of training moves it. What gets redistributed is the energy left
 * after protein: towards carbohydrate before and after a session, away from it
 * on a day with nothing to fuel.
 *
 * The tilt is partial on purpose. Your configured macro targets are still the
 * plan; this bends one meal within the day rather than replacing them. And it
 * pays for itself: `mealTarget` hands each later meal what the daily target
 * has left, so a lunch tilted towards carbohydrate leaves dinner with less of
 * it and the day still lands where it should.
 */
const CARB_SHARE: Partial<Record<TrainingPhase, number>> = {
  pre: 0.78,
  during: 0.8,
  post: 0.72,
  rest: 0.5,
};

/** How far towards the phase's ideal shape a meal is pulled, 0-1. */
const TILT = 0.6;

export function tiltTarget(t: MealTarget, phase?: TrainingPhase): MealTarget {
  const ideal = phase === undefined ? undefined : CARB_SHARE[phase];
  if (ideal === undefined || t.carbsG === null || t.fatG === null) return t;

  const afterProtein = t.kcal - (t.proteinG ?? 0) * 4;
  if (afterProtein <= 0) return t;

  const plannedEnergy = t.carbsG * 4 + t.fatG * 9;
  if (plannedEnergy <= 0) return t;

  const current = (t.carbsG * 4) / plannedEnergy;
  const share = current + (ideal - current) * TILT;
  return {
    ...t,
    carbsG: (afterProtein * share) / 4,
    fatG: (afterProtein * (1 - share)) / 9,
  };
}

/**
 * How far a plate lands from the target. Protein counts most, and running
 * short of it costs far more than going over: in a deficit, extra protein is
 * the macro that protects muscle.
 *
 * `phase` adds a smaller timing term on top — carbohydrate before the session,
 * protein and carbohydrate after it. It breaks ties between plates that
 * already fit; it never outweighs getting the size right.
 */
export function fitScore(m: Macros, t: MealTarget, phase?: TrainingPhase): number {
  const rel = (a: number, b: number, floor: number) => Math.abs(a - b) / Math.max(b, floor);
  let score = rel(m.kcal, t.kcal, 100);
  if (t.proteinG !== null) {
    const short = t.proteinG - m.proteinG;
    score += (short > 0 ? 1.5 : 0.2) * (Math.abs(short) / Math.max(t.proteinG, 10));
  }
  if (t.carbsG !== null) score += 0.5 * rel(m.carbsG, t.carbsG, 10);
  if (t.fatG !== null) score += 0.5 * rel(m.fatG, t.fatG, 5);
  if (phase) score += phasePenalty(m, phase);
  return score;
}

/** Every idea for the meal the library can build, best fit first. */
export function ideasFor(
  meal: MealSlot,
  foods: Food[],
  target: MealTarget,
  phase?: TrainingPhase,
): ScaledIdea[] {
  const bySlug = new Map<string, Food>();
  for (const f of foods) if (f.seedSlug && !f.isArchived) bySlug.set(f.seedSlug, f);

  const out: ScaledIdea[] = [];
  for (const idea of MEAL_IDEAS) {
    if (idea.meal !== meal) continue;
    const scaled = scaleIdea(idea, bySlug, target.kcal);
    if (scaled) out.push({ ...scaled, score: fitScore(scaled.macros, target, phase) });
  }
  return out.sort((a, b) => a.score - b.score);
}

const BASE_TIP: Record<MealSlot, string> = {
  breakfast:
    'Proteína desde el desayuno: repartida en el día le rinde más al músculo que juntada a la noche.',
  lunch: 'Medio plato de verdura, un cuarto de proteína y un cuarto de carbohidrato.',
  snack: 'Entre horas no es un premio: que sume proteína o fibra, no sólo calorías.',
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
