import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings, updateSettings } from '../db/db';
import type { MealSlot } from '../db/types';
import { MEAL_LABEL, impliedKcal, normaliseSplit } from '../lib/nutrition';
import { Card, Chip, SectionTitle, cx } from './ui';
import { Stepper } from './Stepper';

const MEAL_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Enough of a step to be worth a tap, small enough to land on a real number. */
const KCAL_STEP = 50;

export function FuelTargets() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  if (!settings) return null;

  const kcal = settings.kcalTarget ?? 0;
  const protein = settings.proteinTargetG ?? 0;
  const carbs = settings.carbsTargetG ?? 0;
  const fat = settings.fatTargetG ?? 0;
  const split = normaliseSplit(settings.mealSplit, MEAL_ORDER);

  // Macros are set independently of the energy target, so they can disagree.
  // Saying so is more useful than silently letting one of them be wrong.
  const fromMacros = impliedKcal({ proteinG: protein, carbsG: carbs, fatG: fat });
  const macrosSet = protein > 0 || carbs > 0 || fat > 0;
  const drift = kcal > 0 && macrosSet ? Math.abs(fromMacros - kcal) / kcal : 0;

  function setShare(meal: MealSlot, pct: number) {
    const next = { ...split, [meal]: Math.max(0, pct) / 100 };
    void updateSettings({ mealSplit: normaliseSplit(next, MEAL_ORDER) });
  }

  return (
    <>
      <SectionTitle>Objetivos diarios</SectionTitle>
      <Card className="space-y-3 p-3">
        <Stepper
          label="Calorías"
          value={kcal}
          onChange={(value) => updateSettings({ kcalTarget: value })}
          step={KCAL_STEP}
          min={0}
          max={6000}
          suffix="kcal"
          tone="iron"
        />

        <div className="grid grid-cols-1 gap-3">
          <Stepper
            label="Proteína"
            value={protein}
            onChange={(value) => updateSettings({ proteinTargetG: value })}
            step={5}
            min={0}
            max={400}
            suffix="g"
          />
          <Stepper
            label="Carbohidratos"
            value={carbs}
            onChange={(value) => updateSettings({ carbsTargetG: value })}
            step={10}
            min={0}
            max={800}
            suffix="g"
          />
          <Stepper
            label="Grasa"
            value={fat}
            onChange={(value) => updateSettings({ fatTargetG: value })}
            step={5}
            min={0}
            max={300}
            suffix="g"
          />
        </div>

        {drift > 0.05 ? (
          <p className="rounded-lg bg-gold/10 px-2.5 py-2 text-[11px] leading-snug text-gold">
            Tus macros suman {Math.round(fromMacros)} kcal y tu objetivo dice {kcal}. No están mal
            necesariamente — pero si querés que cierren, movelos hasta que coincidan.
          </p>
        ) : null}

        <Stepper
          label="Agua por día"
          value={settings.waterTargetMl ?? 0}
          onChange={(value) => updateSettings({ waterTargetMl: value })}
          step={250}
          min={0}
          max={6000}
          suffix="ml"
          format={(v) => (v === 0 ? 'sin objetivo' : String(v))}
        />

        <button
          type="button"
          onClick={() => updateSettings({ weeklyBudgetEnabled: !settings.weeklyBudgetEnabled })}
          className="flex w-full items-center gap-3 rounded-xl bg-raised px-3 py-2.5 text-left active:bg-line"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Presupuesto semanal</span>
            <span className="block text-[11px] leading-snug text-faint">
              Lee el día contra lo que queda de la semana, no contra un tope fijo. Es lo que deja
              pagar un domingo grande con los días de alrededor.
            </span>
          </span>
          <Chip tone={settings.weeklyBudgetEnabled ? 'fuel' : 'neutral'}>
            {settings.weeklyBudgetEnabled ? 'On' : 'Off'}
          </Chip>
        </button>
      </Card>

      <SectionTitle
        action={<span className="text-[11px] text-faint">siempre suma 100%</span>}
      >
        Reparto por comida
      </SectionTitle>
      <Card className="space-y-2 p-3">
        <p className="text-[11px] leading-snug text-faint">
          Cuánto del día lleva cada comida. Movelo hasta que se parezca a como comés de verdad: un
          reparto que no coincide produce objetivos que vas a ignorar.
        </p>
        {MEAL_ORDER.map((meal) => {
          const pct = Math.round(split[meal] * 100);
          return (
            <div key={meal} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm">{MEAL_LABEL[meal]}</span>
              <span
                className={cx(
                  'tabular w-16 shrink-0 text-right text-sm font-semibold',
                  pct === 0 ? 'text-faint' : 'text-fuel',
                )}
              >
                {kcal > 0 ? `${Math.round(kcal * split[meal])}` : `${pct}%`}
                <span className="ml-0.5 text-[10px] font-medium text-muted">
                  {kcal > 0 ? 'kcal' : ''}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={70}
                step={5}
                value={pct}
                onChange={(e) => setShare(meal, Number(e.target.value))}
                className="h-8 min-w-0 flex-1 accent-fuel"
                aria-label={`Porcentaje de ${MEAL_LABEL[meal]}`}
              />
            </div>
          );
        })}
      </Card>
    </>
  );
}
