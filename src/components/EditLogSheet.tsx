import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { FoodLog, MealSlot } from '../db/types';
import { MEAL_SLOTS } from '../db/types';
import { MEAL_LABEL, fmtGrams, fmtKcal } from '../lib/nutrition';
import { Button, Card, Chip, ConfirmRow, Field, Segmented, Sheet, TextInput } from './ui';
import { CountPicker } from './AddFoodSheet';

const num = (s: string): number => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const MEAL_OPTIONS = MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABEL[m] }));

export function EditLogSheet({ log, onClose }: { log: FoodLog | null; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [meal, setMeal] = useState<MealSlot>('lunch');
  const [estimated, setEstimated] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // The food is only needed for its portion shortcuts; the numbers come from
  // the log's own snapshot, never from the food as it stands today.
  const food = useLiveQuery(
    async () => (log?.foodId ? await db.foods.get(log.foodId) : undefined),
    [log?.foodId],
    undefined,
  );

  useEffect(() => {
    if (!log) return;
    setAmount(String(log.amount));
    setKcal(String(Math.round(log.kcal)));
    setProtein(String(Math.round(log.proteinG)));
    setMeal(log.meal);
    setEstimated(log.estimated);
    setConfirming(false);
  }, [log]);

  if (!log) return <Sheet open={false} onClose={onClose} children={null} />;

  const freehand = log.foodId == null;
  const newAmount = num(amount);

  /**
   * Editing the quantity rescales the macros that were stored with the entry
   * rather than re-reading them off the food. If the food's values were
   * corrected since, fixing a typo in the amount must not silently adopt those
   * new numbers into a meal you already ate.
   */
  const factor = log.amount > 0 ? newAmount / log.amount : 0;
  const preview = freehand
    ? {
        kcal: num(kcal),
        proteinG: num(protein),
        carbsG: 0,
        fatG: 0,
        fiberG: log.fiberG ?? null,
      }
    : {
        kcal: log.kcal * factor,
        proteinG: log.proteinG * factor,
        carbsG: log.carbsG * factor,
        fatG: log.fatG * factor,
        fiberG: log.fiberG == null ? null : log.fiberG * factor,
      };

  const unitWord = log.unit === 'unit' ? 'unidad' : log.unit;
  const canSave = freehand ? preview.kcal > 0 : newAmount > 0;

  async function save() {
    if (!log || !canSave) return;
    await db.foodLogs.put({
      ...log,
      amount: freehand ? log.amount : newAmount,
      meal,
      estimated,
      kcal: preview.kcal,
      proteinG: preview.proteinG,
      carbsG: preview.carbsG,
      fatG: preview.fatG,
      fiberG: preview.fiberG,
    });
    onClose();
  }

  async function remove() {
    if (!log) return;
    await db.foodLogs.delete(log.id);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={log.name}>
      <div className="space-y-3">
        {freehand ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Calorías">
              <TextInput
                inputMode="decimal"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
              />
            </Field>
            <Field label="Proteína (g)">
              <TextInput
                inputMode="decimal"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <>
            {log.unit === 'unit' ? (
              <CountPicker value={newAmount} onChange={(n) => setAmount(String(n))} />
            ) : null}

            {food && food.portions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {food.portions.map((p) => (
                  <button key={p.label} type="button" onClick={() => setAmount(String(p.amount))}>
                    <Chip tone={newAmount === p.amount ? 'fuel' : 'neutral'}>
                      {p.label} · {p.amount} {unitWord}
                    </Chip>
                  </button>
                ))}
              </div>
            ) : null}

            <Field label={log.unit === 'unit' ? 'Cuántos' : `Cantidad en ${unitWord}`}>
              <TextInput
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </>
        )}

        <Field label="Comida">
          <Segmented options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
        </Field>

        <Card className="p-3">
          <div className="tabular grid grid-cols-4 gap-2 text-center">
            {[
              ['kcal', fmtKcal(preview.kcal)],
              ['prot', fmtGrams(preview.proteinG)],
              ['carb', fmtGrams(preview.carbsG)],
              ['gras', fmtGrams(preview.fatG)],
            ].map(([label, v]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
                  {label}
                </p>
                <p className="mt-0.5 text-base font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </Card>

        <button
          type="button"
          onClick={() => setEstimated(!estimated)}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-raised px-3 py-2.5 text-left active:bg-line"
        >
          <span className="text-sm">Estimado a ojo</span>
          <Chip tone={estimated ? 'gold' : 'neutral'}>{estimated ? 'Sí' : 'No'}</Chip>
        </button>

        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={save} disabled={!canSave}>
            Guardar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>

        {confirming ? (
          <ConfirmRow
            message="Se borra este registro del día. No toca el alimento en la biblioteca."
            confirmLabel="Borrar"
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full py-2 text-center text-xs font-medium text-danger active:text-danger/70"
          >
            Borrar del día
          </button>
        )}
      </div>
    </Sheet>
  );
}
