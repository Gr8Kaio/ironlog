import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Food, FoodLog, MealSlot, Portion } from '../db/types';
import { getQuickFoods, touchFood } from '../db/queries';
import { MEAL_LABEL, fmtGrams, fmtKcal, macrosFor, matchesFood } from '../lib/nutrition';
import { Button, Card, Chip, Field, Segmented, Sheet, TextInput, cx } from '../components/ui';
import { FlameIcon } from './icons';

const num = (s: string): number => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** The whole point of the sheet: what this mouthful costs against what is left. */
function Budget({
  dayRemaining,
  mealSuggested,
  meal,
  cost,
}: {
  dayRemaining: number;
  mealSuggested: number;
  meal: MealSlot;
  cost: number;
}) {
  const afterDay = dayRemaining - cost;
  const afterMeal = mealSuggested - cost;
  const overDay = afterDay < 0;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className={cx('rounded-xl px-3 py-2.5', overDay ? 'bg-danger/10' : 'bg-raised')}>
        <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
          {cost > 0 ? 'Quedaría hoy' : 'Queda hoy'}
        </p>
        <p
          className={cx(
            'tabular mt-0.5 text-xl leading-none font-semibold',
            overDay ? 'text-danger' : 'text-fuel',
          )}
        >
          {fmtKcal(afterDay)}
          <span className="ml-0.5 text-xs font-medium text-muted">kcal</span>
        </p>
      </div>
      <div className="rounded-xl bg-raised px-3 py-2.5">
        <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
          {MEAL_LABEL[meal]}
        </p>
        <p
          className={cx(
            'tabular mt-0.5 text-xl leading-none font-semibold',
            afterMeal < 0 ? 'text-gold' : 'text-fg',
          )}
        >
          {fmtKcal(afterMeal)}
          <span className="ml-0.5 text-xs font-medium text-muted">kcal</span>
        </p>
      </div>
    </div>
  );
}

export function AddFoodSheet({
  open,
  onClose,
  meal,
  localDate,
  dayRemaining,
  mealSuggested,
}: {
  open: boolean;
  onClose: () => void;
  meal: MealSlot;
  localDate: string;
  dayRemaining: number;
  mealSuggested: number;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [freehand, setFreehand] = useState(false);

  const quick = useLiveQuery(() => getQuickFoods(30), [], undefined);
  const all = useLiveQuery(() => db.foods.toArray(), [], undefined);

  // Reopening the sheet must not resume a half-finished entry from last time.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setPicked(null);
      setFreehand(false);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return quick ?? [];
    return (all ?? []).filter((f) => !f.isArchived && matchesFood(f, query)).slice(0, 40);
  }, [query, quick, all]);

  const title = picked ? picked.name : freehand ? 'Carga rápida' : `Agregar a ${MEAL_LABEL[meal].toLowerCase()}`;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {picked ? (
        <AmountStep
          food={picked}
          meal={meal}
          localDate={localDate}
          dayRemaining={dayRemaining}
          mealSuggested={mealSuggested}
          onBack={() => setPicked(null)}
          onDone={onClose}
        />
      ) : freehand ? (
        <FreehandStep
          meal={meal}
          localDate={localDate}
          dayRemaining={dayRemaining}
          mealSuggested={mealSuggested}
          onBack={() => setFreehand(false)}
          onDone={onClose}
        />
      ) : (
        <>
          <Budget dayRemaining={dayRemaining} mealSuggested={mealSuggested} meal={meal} cost={0} />

          <TextInput
            className="mt-3"
            placeholder="Buscar alimento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />

          {query === '' ? (
            <p className="mt-2 text-[11px] text-faint">
              Lo último y lo que más usás, primero. Después de un par de semanas esta lista es tu dieta.
            </p>
          ) : null}

          <div className="mt-2 space-y-1.5">
            {results.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => setPicked(food)}
                className="flex w-full items-center gap-3 rounded-xl bg-raised px-3 py-2.5 text-left active:bg-line"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {food.name}
                    {food.brand ? <span className="text-muted"> · {food.brand}</span> : null}
                  </span>
                  <span className="tabular block text-[11px] text-faint">
                    {fmtKcal(food.kcal)} kcal
                    {food.refUnit === 'unit' ? ' por unidad' : ` /${food.refAmount} ${food.refUnit}`}
                  </span>
                </span>
                {food.useCount > 0 ? <Chip tone="neutral">{food.useCount}×</Chip> : null}
              </button>
            ))}
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-faint">Nada con ese nombre.</p>
            ) : null}
          </div>

          <Button variant="outline" className="mt-3 w-full text-sm" onClick={() => setFreehand(true)}>
            Cargar solo calorías
          </Button>
        </>
      )}
    </Sheet>
  );
}

// -------------------------------------------------------------- amount step

function AmountStep({
  food,
  meal,
  localDate,
  dayRemaining,
  mealSuggested,
  onBack,
  onDone,
}: {
  food: Food;
  meal: MealSlot;
  localDate: string;
  dayRemaining: number;
  mealSuggested: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(() => String(food.portions[0]?.amount ?? food.refAmount));
  const [estimated, setEstimated] = useState(false);
  // A weighed food with a "unidad" portion can also be counted: 15 almendras
  // instead of working out 18 g by hand. The log still stores grams.
  const unitPortion =
    food.refUnit === 'unit' ? undefined : food.portions.find((p) => p.label === 'unidad');
  const [byCount, setByCount] = useState(false);
  const [count, setCount] = useState('10');

  const value = byCount && unitPortion ? num(count) * unitPortion.amount : num(amount);
  const macros = macrosFor(food, value);
  const unitWord = food.refUnit === 'unit' ? 'unidad' : food.refUnit;

  async function save() {
    if (value <= 0) return;
    const now = Date.now();
    const log: FoodLog = {
      id: newId(),
      localDate,
      loggedAt: now,
      foodId: food.id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      amount: value,
      unit: food.refUnit,
      kcal: macros.kcal,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      fiberG: macros.fiberG,
      meal,
      estimated,
    };
    await db.foodLogs.add(log);
    await touchFood(food.id);
    onDone();
  }

  return (
    <div className="space-y-3">
      <Budget
        dayRemaining={dayRemaining}
        mealSuggested={mealSuggested}
        meal={meal}
        cost={macros.kcal}
      />

      {unitPortion ? (
        <Segmented
          options={[
            { value: 'weight', label: 'Por peso' },
            { value: 'count', label: 'Por unidad' },
          ]}
          value={byCount ? 'count' : 'weight'}
          onChange={(v) => setByCount(v === 'count')}
        />
      ) : null}

      {byCount && unitPortion ? (
        <>
          <CountPicker
            value={num(count)}
            onChange={(n) => setCount(String(n))}
            options={[5, 10, 15, 20, 30]}
          />
          <Field
            label="Cuántas unidades"
            hint={`${fmtGrams(value)} g · 1 unidad = ${unitPortion.amount} g`}
          >
            <TextInput
              inputMode="decimal"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              autoFocus
            />
          </Field>
        </>
      ) : (
        <>
          {food.refUnit === 'unit' ? (
            <CountPicker value={value} onChange={(n) => setAmount(String(n))} />
          ) : null}

          {food.portions.some((p) => p !== unitPortion) ? (
            <div className="flex flex-wrap gap-1.5">
              {food.portions
                .filter((p) => p !== unitPortion)
                .map((p: Portion) => (
                  <button key={p.label} type="button" onClick={() => setAmount(String(p.amount))}>
                    <Chip tone={value === p.amount ? 'fuel' : 'neutral'}>
                      {p.label} · {p.amount} {unitWord}
                    </Chip>
                  </button>
                ))}
            </div>
          ) : null}

          <Field label={food.refUnit === 'unit' ? 'Cuántos' : `Cantidad en ${unitWord}`}>
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
        </>
      )}

      <Card className="p-3">
        <div className="tabular grid grid-cols-4 gap-2 text-center">
          {[
            ['kcal', fmtKcal(macros.kcal)],
            ['prot', fmtGrams(macros.proteinG)],
            ['carb', fmtGrams(macros.carbsG)],
            ['gras', fmtGrams(macros.fatG)],
          ].map(([label, v]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">{label}</p>
              <p className="mt-0.5 text-base font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <EstimatedToggle value={estimated} onChange={setEstimated} />

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={value <= 0}>
          Agregar
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ freehand step

function FreehandStep({
  meal,
  localDate,
  dayRemaining,
  mealSuggested,
  onBack,
  onDone,
}: {
  meal: MealSlot;
  localDate: string;
  dayRemaining: number;
  mealSuggested: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');

  const value = num(kcal);

  async function save() {
    if (value <= 0) return;
    const now = Date.now();
    await db.foodLogs.add({
      id: newId(),
      localDate,
      loggedAt: now,
      foodId: null,
      name: name.trim() || 'Comida sin detallar',
      amount: 1,
      unit: 'unit',
      kcal: value,
      proteinG: num(protein),
      carbsG: 0,
      fatG: 0,
      fiberG: null,
      meal,
      // A freehand entry is an estimate by construction: if it were weighed it
      // would have been logged against a food.
      estimated: true,
    });
    onDone();
  }

  return (
    <div className="space-y-3">
      <Budget dayRemaining={dayRemaining} mealSuggested={mealSuggested} meal={meal} cost={value} />

      <p className="text-[11px] leading-snug text-faint">
        Para lo que no vas a pesar: la comida de afuera, la mesa familiar. Estimá y seguí — queda
        marcado como estimado y el promedio de la semana absorbe el error. Dejar de registrar cuesta
        mucho más que redondear mal.
      </p>

      <Field label="Qué fue">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Asado en lo de la suegra"
          autoComplete="off"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Calorías">
          <TextInput
            inputMode="decimal"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="900"
          />
        </Field>
        <Field label="Proteína (g)" hint="Opcional">
          <TextInput
            inputMode="decimal"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="60"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={value <= 0}>
          Agregar
        </Button>
      </div>
    </div>
  );
}

function EstimatedToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
        value ? 'bg-gold/10' : 'bg-raised active:bg-line',
      )}
    >
      <span
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          value ? 'bg-gold/20 text-gold' : 'bg-line text-faint',
        )}
      >
        <FlameIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-sm font-medium', value ? 'text-gold' : 'text-fg')}>
          {value ? 'Marcado como estimado' : 'Marcar como estimado'}
        </span>
        <span className="block text-[11px] text-faint">Lo calculaste a ojo en vez de pesarlo</span>
      </span>
    </button>
  );
}

/** Counting chips for a unit food: tapping 2 is the whole interaction. */
export function CountPicker({
  value,
  onChange,
  options = [0.5, 1, 2, 3, 4, 6],
}: {
  value: number;
  onChange: (next: number) => void;
  options?: number[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Chip tone={value === n ? 'fuel' : 'neutral'}>
            {n === 0.5 ? 'media' : n}
          </Chip>
        </button>
      ))}
    </div>
  );
}
