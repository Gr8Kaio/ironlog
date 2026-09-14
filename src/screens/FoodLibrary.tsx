import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Food, FoodUnit, Portion } from '../db/types';
import { FOOD_UNITS } from '../db/types';
import { energyMismatch, fmtGrams, fmtKcal, impliedKcal } from '../lib/nutrition';
import {
  Button,
  Card,
  Chip,
  ConfirmRow,
  Field,
  Screen,
  Select,
  Sheet,
  TextInput,
  TopBar,
} from '../components/ui';
import { ChevronLeft, FlameIcon, PlusIcon, TrashIcon } from '../components/icons';

const UNIT_LABEL: Record<FoodUnit, string> = {
  g: 'gramos',
  ml: 'mililitros',
  unit: 'unidad',
};

export function FoodLibrary() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Food | 'new' | null>(null);

  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [], undefined);

  const shown = useMemo(() => {
    if (!foods) return [];
    const q = query.trim().toLowerCase();
    return foods.filter(
      (f) =>
        (showArchived ? f.isArchived : !f.isArchived) &&
        (q === '' || f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q)),
    );
  }, [foods, query, showArchived]);

  const activeCount = (foods ?? []).filter((f) => !f.isArchived).length;
  const archivedCount = (foods ?? []).filter((f) => f.isArchived).length;

  return (
    <Screen>
      <TopBar
        title="Alimentos"
        subtitle={`${activeCount} en la biblioteca`}
        left={
          <button
            type="button"
            onClick={() => navigate('/fuel')}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        right={
          <Button
            variant="primary"
            className="min-h-10 px-3 text-sm"
            onClick={() => setEditing('new')}
          >
            <PlusIcon className="size-4" /> Nuevo
          </Button>
        }
      />

      <TextInput
        placeholder="Buscar alimento"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      {archivedCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="mt-2 w-full py-2 text-center text-[11px] font-medium text-muted active:text-fg"
        >
          {showArchived ? 'Ver activos' : `Ver archivados (${archivedCount})`}
        </button>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {shown.map((food) => (
          <FoodRow key={food.id} food={food} onOpen={() => setEditing(food)} />
        ))}
        {foods && shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">
            {query ? 'Nada con ese nombre.' : 'Todavía no hay alimentos.'}
          </p>
        ) : null}
      </div>

      <FoodEditor
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        food={editing}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

function FoodRow({ food, onOpen }: { food: Food; onOpen: () => void }) {
  const per = food.refUnit === 'unit' ? 'por unidad' : `/${food.refAmount} ${food.refUnit}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left active:bg-raised"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fuel/15 text-fuel">
        <FlameIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {food.name}
          {food.brand ? <span className="text-muted"> · {food.brand}</span> : null}
        </span>
        <span className="tabular block truncate text-[11px] text-faint">
          P {fmtGrams(food.proteinG)} · C {fmtGrams(food.carbsG)} · G {fmtGrams(food.fatG)} {per}
        </span>
      </span>
      <span className="tabular shrink-0 text-right text-sm font-semibold text-fuel">
        {fmtKcal(food.kcal)}
        <span className="ml-0.5 text-[10px] font-medium text-muted">kcal</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ editor

interface Draft {
  name: string;
  brand: string;
  refAmount: string;
  refUnit: FoodUnit;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  portions: Portion[];
}

function toDraft(food: Food | 'new' | null): Draft {
  if (!food || food === 'new') {
    return {
      name: '',
      brand: '',
      refAmount: '100',
      refUnit: 'g',
      kcal: '',
      proteinG: '',
      carbsG: '',
      fatG: '',
      fiberG: '',
      portions: [],
    };
  }
  return {
    name: food.name,
    brand: food.brand ?? '',
    refAmount: String(food.refAmount),
    refUnit: food.refUnit,
    kcal: String(food.kcal),
    proteinG: String(food.proteinG),
    carbsG: String(food.carbsG),
    fatG: String(food.fatG),
    fiberG: food.fiberG == null ? '' : String(food.fiberG),
    portions: food.portions ?? [],
  };
}

const num = (s: string): number => {
  // Comma is the decimal separator on an es-AR keyboard; accept both.
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function FoodEditor({ food, onClose }: { food: Food | 'new' | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(food));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const existing = food && food !== 'new' ? food : null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const parsed = {
    kcal: num(draft.kcal),
    proteinG: num(draft.proteinG),
    carbsG: num(draft.carbsG),
    fatG: num(draft.fatG),
    fiberG: draft.fiberG.trim() === '' ? null : num(draft.fiberG),
  };
  const mismatch = energyMismatch(parsed);
  const canSave = draft.name.trim() !== '' && num(draft.refAmount) > 0;

  async function save() {
    if (!canSave) return;
    const now = Date.now();
    const row: Food = {
      id: existing?.id ?? newId(),
      name: draft.name.trim(),
      brand: draft.brand.trim() || undefined,
      refAmount: num(draft.refAmount),
      refUnit: draft.refUnit,
      kcal: parsed.kcal,
      proteinG: parsed.proteinG,
      carbsG: parsed.carbsG,
      fatG: parsed.fatG,
      fiberG: draft.fiberG.trim() === '' ? null : num(draft.fiberG),
      portions: draft.portions.filter((p) => p.label.trim() !== '' && p.amount > 0),
      source: existing?.source,
      isFavorite: existing?.isFavorite ?? false,
      isArchived: existing?.isArchived ?? false,
      lastUsedAt: existing?.lastUsedAt ?? null,
      useCount: existing?.useCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.foods.put(row);
    onClose();
  }

  async function toggleArchive() {
    if (!existing) return;
    await db.foods.put({ ...existing, isArchived: !existing.isArchived, updatedAt: Date.now() });
    onClose();
  }

  async function remove() {
    if (!existing) return;
    await db.foods.delete(existing.id);
    onClose();
  }

  const unitWord = draft.refUnit === 'unit' ? 'unidad' : draft.refUnit;

  return (
    <Sheet
      open={food !== null}
      onClose={onClose}
      title={existing ? 'Editar alimento' : 'Nuevo alimento'}
    >
      <div className="space-y-3">
        <Field label="Nombre">
          <TextInput
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Pechuga de pollo"
            autoComplete="off"
          />
        </Field>

        <Field label="Marca" hint="Opcional. Útil para distinguir dos yogures.">
          <TextInput
            value={draft.brand}
            onChange={(e) => set('brand', e.target.value)}
            placeholder="Ser"
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Los valores son por">
            <TextInput
              inputMode="decimal"
              value={draft.refAmount}
              onChange={(e) => set('refAmount', e.target.value)}
            />
          </Field>
          <Field label="Unidad">
            <Select
              value={draft.refUnit}
              onChange={(e) => set('refUnit', e.target.value as FoodUnit)}
            >
              {FOOD_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Card className="p-3">
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-faint uppercase">
            Cada {draft.refAmount || '?'} {unitWord}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Calorías">
              <TextInput
                inputMode="decimal"
                value={draft.kcal}
                onChange={(e) => set('kcal', e.target.value)}
                placeholder="120"
              />
            </Field>
            <Field label="Proteína (g)">
              <TextInput
                inputMode="decimal"
                value={draft.proteinG}
                onChange={(e) => set('proteinG', e.target.value)}
                placeholder="22.5"
              />
            </Field>
            <Field label="Carbohidratos (g)">
              <TextInput
                inputMode="decimal"
                value={draft.carbsG}
                onChange={(e) => set('carbsG', e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Grasa (g)">
              <TextInput
                inputMode="decimal"
                value={draft.fatG}
                onChange={(e) => set('fatG', e.target.value)}
                placeholder="2.6"
              />
            </Field>
            <Field label="Fibra (g)" className="col-span-2">
              <TextInput
                inputMode="decimal"
                value={draft.fiberG}
                onChange={(e) => set('fiberG', e.target.value)}
                placeholder="opcional"
              />
            </Field>
          </div>

          {mismatch !== null ? (
            <p className="mt-2 rounded-lg bg-gold/10 px-2.5 py-2 text-[11px] leading-snug text-gold">
              Los macros dan {fmtKcal(impliedKcal(parsed))} kcal, no {fmtKcal(parsed.kcal)}.
              Revisá que no se haya colado un dígito o una unidad equivocada.
            </p>
          ) : null}
        </Card>

        <PortionEditor
          portions={draft.portions}
          unitWord={unitWord}
          onChange={(portions) => set('portions', portions)}
        />

        {existing?.source ? (
          <p className="text-[11px] leading-snug text-faint">Fuente: {existing.source}</p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button variant="primary" className="flex-1" onClick={save} disabled={!canSave}>
            Guardar
          </Button>
          {existing ? (
            <Button variant="outline" onClick={toggleArchive}>
              {existing.isArchived ? 'Restaurar' : 'Archivar'}
            </Button>
          ) : null}
        </div>

        {existing ? (
          confirmingDelete ? (
            <ConfirmRow
              message="Borrar el alimento no toca lo que ya comiste: cada registro guarda su propia copia de los macros."
              confirmLabel="Borrar"
              onConfirm={remove}
              onCancel={() => setConfirmingDelete(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-medium text-danger active:text-danger/70"
            >
              <TrashIcon className="size-4" /> Borrar
            </button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}

function PortionEditor({
  portions,
  unitWord,
  onChange,
}: {
  portions: Portion[];
  unitWord: string;
  onChange: (portions: Portion[]) => void;
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  function add() {
    if (label.trim() === '' || num(amount) <= 0) return;
    onChange([...portions, { label: label.trim(), amount: num(amount) }]);
    setLabel('');
    setAmount('');
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Porciones</p>
      <p className="mb-2 text-[11px] leading-snug text-faint">
        Atajos para no pesar todo: "pote", "rebanada", "plato". Se guardan en {unitWord}.
      </p>

      {portions.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {portions.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              type="button"
              onClick={() => onChange(portions.filter((_, j) => j !== i))}
              className="active:bg-line"
            >
              <Chip tone="neutral">
                {p.label} · {p.amount} {unitWord} ✕
              </Chip>
            </button>
          ))}
        </div>
      ) : null}

      {/* Each input keeps its own `w-full` and the wrapper owns the width:
          putting `flex-1` or `w-24` on the input itself collides with it. */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="pote"
            autoComplete="off"
          />
        </div>
        <div className="w-24 shrink-0">
          <TextInput
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="190"
          />
        </div>
        <Button variant="outline" onClick={add}>
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
