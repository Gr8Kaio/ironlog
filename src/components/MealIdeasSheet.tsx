import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { FoodLog, MealSlot } from '../db/types';
import { getLogsSince, touchFood } from '../db/queries';
import { MEAL_LABEL, fmtAmount, fmtGrams, fmtKcal } from '../lib/nutrition';
import { addDaysToLocalDate } from '../lib/dates';
import {
  eatenStems,
  ideasFor,
  mealTips,
  tiltTarget,
  type MealTarget,
  type ScaledIdea,
} from '../lib/mealIdeas';
import { phaseBadge, phaseCopy, type TrainingContext } from '../lib/trainingFuel';
import { Button, Card, Chip, Sheet } from './ui';

export function MealIdeasSheet({
  meal,
  target,
  ctx,
  localDate,
  onClose,
}: {
  meal: MealSlot | null;
  target: MealTarget | null;
  /** Where the day sits relative to training. Orders the plates and heads the tips. */
  ctx: TrainingContext;
  localDate: string;
  onClose: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), [], undefined);
  // Six weeks: long enough that a week off logging does not erase your diet,
  // short enough that it is still your diet and not last season's.
  const recentLogs = useLiveQuery(
    () => getLogsSince(addDaysToLocalDate(localDate, -42)),
    [localDate],
    undefined,
  );
  // Everything below reads the tilted target: the plates are ranked against the
  // shape the moment calls for, and the header shows the same number, so the
  // ordering is never something that happens off-screen.
  const aimed = target ? tiltTarget(target, ctx.phase) : null;
  const eaten = recentLogs ? eatenStems(recentLogs) : null;
  const ideas = meal && aimed && foods ? ideasFor(meal, foods, aimed, ctx.phase, eaten) : [];
  const tilted =
    target !== null &&
    aimed !== null &&
    aimed.carbsG !== null &&
    target.carbsG !== null &&
    Math.abs(aimed.carbsG - target.carbsG) >= 1;

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
      {meal && aimed ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Objetivo de esta comida
            </p>
            <p className="tabular mt-0.5 text-sm">
              <span className="text-lg font-semibold text-fuel">{fmtKcal(aimed.kcal)}</span>
              <span className="text-xs text-muted"> kcal</span>
              {aimed.proteinG !== null ? ` · P ${fmtGrams(aimed.proteinG)}` : ''}
              {aimed.carbsG !== null ? ` · C ${fmtGrams(aimed.carbsG)}` : ''}
              {aimed.fatG !== null ? ` · G ${fmtGrams(aimed.fatG)}` : ''}
            </p>
            {tilted ? (
              <p className="mt-1 text-[11px] leading-snug text-faint">
                Mismas calorías, repartidas para el momento: lo que le corras al carbohidrato acá se
                lo descuenta a las comidas que siguen.
              </p>
            ) : null}
          </div>

          <ul className="space-y-1.5">
            {/* The training tip goes first: it is the framing the rest of the
                advice sits inside, not one more thing to bear in mind. */}
            <li className="rounded-lg bg-iron/10 px-2.5 py-2 text-[12px] leading-snug text-iron">
              <span className="font-semibold">{phaseCopy(ctx).title}. </span>
              {phaseCopy(ctx).tip}
            </li>
            {mealTips(meal, aimed).map((tip) => (
              <li key={tip} className="rounded-lg bg-fuel/10 px-2.5 py-2 text-[12px] leading-snug text-fuel">
                {tip}
              </li>
            ))}
          </ul>

          {ideas.map((idea, index) => (
            <Card key={idea.idea.id} className="p-3">
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{idea.idea.name}</p>
                {index === 0 ? <Chip tone="fuel">mejor ajuste</Chip> : null}
                {badgeOf(idea, ctx) ? <Chip tone="iron">{badgeOf(idea, ctx)}</Chip> : null}
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

/** Why this plate suits the moment, when it does. */
function badgeOf(idea: ScaledIdea, ctx: TrainingContext): string | null {
  return phaseBadge(idea.macros, ctx.phase);
}
