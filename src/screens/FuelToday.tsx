import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db/db';
import type { FoodLog, MealSlot } from '../db/types';
import { getLogsForDate, getLogsForWeekOf } from '../db/queries';
import {
  MEAL_LABEL,
  buildWeekBudget,
  dayAllowanceKcal,
  fmtAmount,
  fmtGrams,
  fmtKcal,
  guessMeal,
  normaliseSplit,
  planMeals,
  totalMacros,
} from '../lib/nutrition';
import { addDaysToLocalDate, formatDayLabel, todayLocalDate } from '../lib/dates';
import { mealTarget } from '../lib/mealIdeas';
import { AddFoodSheet } from '../components/AddFoodSheet';
import { MealIdeasSheet } from '../components/MealIdeasSheet';
import { EditLogSheet } from '../components/EditLogSheet';
import { WaterCard } from '../components/WaterCard';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  SectionTitle,
  TopBar,
  cx,
} from '../components/ui';
import { ChevronLeft, ChevronRight, FlameIcon, PlusIcon } from '../components/icons';

/** Meals in the order they happen, which is also the order they are shown. */
const MEAL_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export function FuelToday() {
  const navigate = useNavigate();
  const params = useParams<{ localDate?: string }>();
  const today = todayLocalDate();
  // `/fuel` is today; `/fuel/day/YYYY-MM-DD` is any other day. Forgetting to
  // log dinner until the next morning is normal, and a tracker with nowhere to
  // put it is a tracker you stop using.
  const date = params.localDate ?? today;
  const isToday = date === today;

  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [ideasMeal, setIdeasMeal] = useState<MealSlot | null>(null);

  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const logs = useLiveQuery(() => getLogsForDate(date), [date], undefined);
  const weekLogs = useLiveQuery(() => getLogsForWeekOf(date), [date], undefined);

  const goto = (next: string) =>
    navigate(next === today ? '/fuel' : `/fuel/day/${next}`, { replace: true });

  const dayNav = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => goto(addDaysToLocalDate(date, -1))}
        className="flex size-9 items-center justify-center rounded-lg text-muted active:bg-raised"
        aria-label="Día anterior"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => goto(addDaysToLocalDate(date, 1))}
        disabled={isToday}
        className="flex size-9 items-center justify-center rounded-lg text-muted active:bg-raised disabled:opacity-25"
        aria-label="Día siguiente"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );

  if (!settings || !logs || !weekLogs) {
    return (
      <Screen>
        <TopBar title="Fuel" subtitle={formatDayLabel(date)} right={dayNav} />
      </Screen>
    );
  }

  const target = settings.kcalTarget ?? 0;
  if (target <= 0) return <SetupPrompt onOpen={() => navigate('/settings')} />;

  const budget = buildWeekBudget(weekLogs, target, today);
  // The rolling allowance is a forward-looking number anchored to today, so a
  // past day is read against the flat daily target instead. "Te queda" on a day
  // that is already over would be nonsense.
  const allowance = isToday
    ? dayAllowanceKcal(target, budget, settings.weeklyBudgetEnabled)
    : target;
  const split = normaliseSplit(settings.mealSplit, MEAL_ORDER);
  const plans = planMeals(allowance, split, logs, MEAL_ORDER);

  const eaten = totalMacros(logs);
  const remaining = allowance - eaten.kcal;
  const over = remaining < 0;
  const pct = allowance > 0 ? Math.min(100, (eaten.kcal / allowance) * 100) : 0;

  const pendingShare = plans.filter((p) => !p.hasLogs).reduce((sum, p) => sum + split[p.meal], 0);
  const ideasPlan = plans.find((p) => p.meal === ideasMeal);
  const ideasTarget =
    ideasPlan && pendingShare > 0
      ? mealTarget(
          ideasPlan.suggestedKcal,
          {
            proteinG: settings.proteinTargetG,
            carbsG: settings.carbsTargetG,
            fatG: settings.fatTargetG,
          },
          eaten,
          split[ideasPlan.meal] / pendingShare,
        )
      : null;

  return (
    <Screen>
      <TopBar
        title="Fuel"
        subtitle={formatDayLabel(date)}
        right={dayNav}
      />

      {/* Today's allowance --------------------------------------------- */}
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              {isToday ? (over ? 'Te pasaste por' : 'Te queda hoy') : over ? 'Te pasaste por' : 'Te sobró'}
            </p>
            <p
              className={cx(
                'tabular mt-1 text-4xl leading-none font-semibold',
                over ? 'text-danger' : 'text-fuel',
              )}
            >
              {fmtKcal(Math.abs(remaining))}
              <span className="ml-1 text-sm font-medium text-muted">kcal</span>
            </p>
          </div>
          <p className="tabular shrink-0 text-right text-xs text-muted">
            {fmtKcal(eaten.kcal)} / {fmtKcal(allowance)}
          </p>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
          <div
            className={cx('h-full rounded-full', over ? 'bg-danger' : 'bg-fuel')}
            style={{ width: `${over ? 100 : pct}%` }}
          />
        </div>

        <div className="tabular mt-3 grid grid-cols-4 gap-2 text-center">
          <MacroCell label="prot" value={fmtGrams(eaten.proteinG)} target={settings.proteinTargetG} />
          <MacroCell label="carb" value={fmtGrams(eaten.carbsG)} target={settings.carbsTargetG} />
          <MacroCell label="gras" value={fmtGrams(eaten.fatG)} target={settings.fatTargetG} />
          <MacroCell label="fibra" value={fmtGrams(eaten.fiberG)} target={null} />
        </div>

        {/* Only on today: the rolling budget counts days against *now*, so on a
            day from another week it would pair that week's logs with this
            week's day count and report a total that is simply wrong. */}
        {isToday && settings.weeklyBudgetEnabled ? (
          <button
            type="button"
            onClick={() => navigate('/fuel/week')}
            className="mt-3 flex w-full items-center gap-2 rounded-xl bg-raised px-3 py-2 text-left active:bg-line"
          >
            <span className="tabular min-w-0 flex-1 text-[11px] text-muted">
              Semana: {fmtKcal(budget.consumedKcal)} / {fmtKcal(budget.budgetKcal)} ·{' '}
              {budget.daysLeft === 0 ? 'último día' : `quedan ${budget.daysLeft + 1} días`}
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" />
          </button>
        ) : null}
      </Card>

      {/* Water ---------------------------------------------------------- */}
      <WaterCard
        localDate={date}
        targetMl={settings.waterTargetMl ?? 0}
        isToday={isToday}
      />

      {/* Meals ---------------------------------------------------------- */}
      <SectionTitle
        action={<span className="text-[11px] text-faint">objetivo · comido</span>}
      >
        Comidas
      </SectionTitle>

      <div className="space-y-2">
        {plans.map((plan) => (
          <MealBlock
            key={plan.meal}
            meal={plan.meal}
            targetKcal={plan.targetKcal}
            suggestedKcal={plan.suggestedKcal}
            consumedKcal={plan.consumedKcal}
            logs={logs.filter((l) => l.meal === plan.meal)}
            onAdd={() => setAdding(plan.meal)}
            onIdeas={plan.hasLogs ? undefined : () => setIdeasMeal(plan.meal)}
            onEdit={setEditing}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/fuel/foods')}
        className="mt-3 flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-3 text-left active:bg-raised"
      >
        <span className="min-w-0 flex-1 text-sm text-muted">Biblioteca de alimentos</span>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </button>

      <AddFoodSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        meal={adding ?? guessMeal()}
        localDate={date}
        dayRemaining={remaining}
        mealSuggested={
          plans.find((p) => p.meal === adding)?.suggestedKcal ?? 0
        }
      />

      <EditLogSheet log={editing} onClose={() => setEditing(null)} />

      <MealIdeasSheet
        meal={ideasMeal}
        target={ideasTarget}
        localDate={date}
        onClose={() => setIdeasMeal(null)}
      />
    </Screen>
  );
}

function MacroCell({
  label,
  value,
  target,
}: {
  label: string;
  value: string;
  target?: number | null;
}) {
  return (
    <div className="rounded-lg bg-raised py-1.5">
      <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">
        {value}
        {target ? <span className="text-[11px] font-medium text-faint">/{target}</span> : null}
      </p>
    </div>
  );
}

function MealBlock({
  meal,
  targetKcal,
  suggestedKcal,
  consumedKcal,
  logs,
  onAdd,
  onIdeas,
  onEdit,
}: {
  meal: MealSlot;
  targetKcal: number;
  suggestedKcal: number;
  consumedKcal: number;
  logs: FoodLog[];
  onAdd: () => void;
  /** Only offered while the meal is still empty. */
  onIdeas?: () => void;
  onEdit: (log: FoodLog) => void;
}) {
  const empty = logs.length === 0;
  // Before you eat, the number worth showing is the one adjusted for how the
  // day has actually gone; afterwards, it is what the meal cost against plan.
  const rebalanced = empty && Math.round(suggestedKcal) !== Math.round(targetKcal);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fuel/15 text-fuel">
          <FlameIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{MEAL_LABEL[meal]}</p>
          <p className="tabular text-[11px] text-faint">
            {empty ? (
              <>
                ideal {fmtKcal(suggestedKcal)} kcal
                {rebalanced ? (
                  <span className="text-muted"> · plan {fmtKcal(targetKcal)}</span>
                ) : null}
              </>
            ) : (
              <>
                {fmtKcal(consumedKcal)} de {fmtKcal(targetKcal)} kcal
                {consumedKcal > targetKcal ? (
                  <span className="text-gold"> · +{fmtKcal(consumedKcal - targetKcal)}</span>
                ) : null}
              </>
            )}
          </p>
        </div>
        {onIdeas ? (
          <Button variant="ghost" className="min-h-10 px-3 text-xs" onClick={onIdeas}>
            Ideas
          </Button>
        ) : null}
        <Button variant="outline" className="min-h-10 px-3" onClick={onAdd}>
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {logs.length > 0 ? (
        <div className="mt-2 divide-y divide-line-soft border-t border-line-soft">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} onEdit={() => onEdit(log)} />
          ))}
        </div>
      ) : (
        <div className="h-3" />
      )}
    </Card>
  );
}

function LogRow({ log, onEdit }: { log: FoodLog; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {log.name}
          {log.estimated ? (
            <Chip tone="gold" className="ml-1.5">
              estimado
            </Chip>
          ) : null}
        </span>
        <span className="tabular block text-[11px] text-faint">
          {fmtAmount(log.amount, log.unit)} · P {fmtGrams(log.proteinG)} · C {fmtGrams(log.carbsG)} ·
          G {fmtGrams(log.fatG)}
        </span>
      </span>

      <span className="tabular shrink-0 text-sm font-semibold text-fuel">{fmtKcal(log.kcal)}</span>
      <ChevronRight className="size-4 shrink-0 text-faint" />
    </button>
  );
}

function SetupPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <Screen>
      <TopBar title="Fuel" subtitle={formatDayLabel(todayLocalDate())} />
      <EmptyState
        title="Falta tu objetivo de calorías"
        body="Sin un número no hay contra qué medir. Ponelo en Ajustes y esta pantalla empieza a servir."
        action={
          <Button variant="primary" onClick={onOpen}>
            Configurar objetivos
          </Button>
        }
      />
    </Screen>
  );
}

export { MEAL_ORDER };
