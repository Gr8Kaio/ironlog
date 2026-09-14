import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { FoodLog, MealSlot } from '../db/types';
import { touchFood } from '../db/queries';
import { MEAL_LABEL, fmtAmount, fmtGrams, fmtKcal } from '../lib/nutrition';
import { ideasFor, mealTips, type MealTarget, type ScaledIdea } from '../lib/mealIdeas';
import { Button, Card, Chip, Sheet } from './ui';

export function MealIdeasSheet({
  meal,
  target,
  localDate,
  onClose,
}: {
  meal: MealSlot | null;
  target: MealTarget | null;
  localDate: string;
  onClose: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), [], undefined);
  const ideas = meal && target && foods ? ideasFor(meal, foods, target) : [];

  async function log(idea: ScaledIdea) {
    if (!meal) return;
    const now = Date.now();
    const rows: FoodLog[] = idea.items.map((item, i) => ({
      id: newId(),
      localDate,
      // Offset so the plate keeps its order wherever logs are sorted by time.
      loggedAt: now + i,
      foodId: item.food.id,
      name: item.food.brand ? `${item.food.name} (${item.food.brand})` : item.food.name,
      amount: item.amount,
      unit: item.food.refUnit,
      kcal: item.macros.kcal,
      proteinG: item.macros.proteinG,
      carbsG: item.macros.carbsG,
      fatG: item.macros.fatG,
      fiberG: item.macros.fiberG,
      meal,
      estimated: false,
    }));
    await db.foodLogs.bulkAdd(rows);
    for (const item of idea.items) await touchFood(item.food.id);
    onClose();
  }

  return (
    <Sheet
      open={meal !== null}
      onClose={onClose}
      title={meal ? `Ideas para ${MEAL_LABEL[meal].toLowerCase()}` : 'Ideas'}
    >
      {meal && target ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Objetivo de esta comida
            </p>
            <p className="tabular mt-0.5 text-sm">
              <span className="text-lg font-semibold text-fuel">{fmtKcal(target.kcal)}</span>
              <span className="text-xs text-muted"> kcal</span>
              {target.proteinG !== null ? ` · P ${fmtGrams(target.proteinG)}` : ''}
              {target.carbsG !== null ? ` · C ${fmtGrams(target.carbsG)}` : ''}
              {target.fatG !== null ? ` · G ${fmtGrams(target.fatG)}` : ''}
            </p>
          </div>

          <ul className="space-y-1.5">
            {mealTips(meal, target).map((tip) => (
              <li key={tip} className="rounded-lg bg-fuel/10 px-2.5 py-2 text-[12px] leading-snug text-fuel">
                {tip}
              </li>
            ))}
          </ul>

          {ideas.map((idea, index) => (
            <Card key={idea.idea.id} className="p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{idea.idea.name}</p>
                {index === 0 ? <Chip tone="fuel">mejor ajuste</Chip> : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">{idea.idea.why}</p>

              <ul className="mt-2 space-y-0.5">
                {idea.items.map((item) => (
                  <li key={item.food.id} className="tabular flex gap-2 text-[12px]">
                    <span className="w-14 shrink-0 text-right text-muted">
                      {fmtAmount(item.amount, item.food.refUnit)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.food.name}</span>
                    <span className="shrink-0 text-faint">{fmtKcal(item.macros.kcal)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex items-center gap-2">
                <p className="tabular min-w-0 flex-1 text-[11px] text-muted">
                  <span className="font-semibold text-fuel">{fmtKcal(idea.macros.kcal)} kcal</span> · P{' '}
                  {fmtGrams(idea.macros.proteinG)} · C {fmtGrams(idea.macros.carbsG)} · G{' '}
                  {fmtGrams(idea.macros.fatG)} · fibra {fmtGrams(idea.macros.fiberG)}
                </p>
                <Button variant="primary" className="min-h-10 px-3 text-sm" onClick={() => log(idea)}>
                  Registrar
                </Button>
              </div>
            </Card>
          ))}

          {ideas.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              Faltan alimentos de la biblioteca para armar ideas para esta comida.
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
