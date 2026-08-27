import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { RoutineDay, RoutineExercise } from '../db/types';
import { getExerciseMap } from '../db/queries';
import { formatClock } from '../lib/calc';
import { ExercisePicker } from '../components/ExercisePicker';
import { Stepper } from '../components/Stepper';
import {
  Button,
  Card,
  Chip,
  ConfirmRow,
  Field,
  Screen,
  Sheet,
  TextInput,
  TopBar,
  cx,
} from '../components/ui';
import { ChevronLeft, PlusIcon, TrashIcon } from '../components/icons';

const SUPERSET_LETTERS = ['A', 'B', 'C', 'D'];

export function RoutineEditor() {
  const { routineId = '' } = useParams();
  const navigate = useNavigate();

  const routine = useLiveQuery(() => db.routines.get(routineId), [routineId], undefined);
  const days = useLiveQuery(
    async () =>
      (await db.routineDays.where('routineId').equals(routineId).toArray()).sort(
        (a, b) => a.position - b.position,
      ),
    [routineId],
    undefined,
  );
  const items = useLiveQuery(
    async () => {
      const dayIds = (await db.routineDays.where('routineId').equals(routineId).primaryKeys()) as string[];
      return db.routineExercises.where('routineDayId').anyOf(dayIds).toArray();
    },
    [routineId],
    undefined,
  );
  const exercises = useLiveQuery(() => getExerciseMap(), [], undefined);

  const [pickingForDay, setPickingForDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoutineExercise | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!routine || !days || !items || !exercises) {
    return (
      <Screen>
        <TopBar title="Routine" />
      </Screen>
    );
  }

  async function addDay() {
    const day: RoutineDay = {
      id: newId(),
      routineId,
      name: `Day ${(days?.length ?? 0) + 1}`,
      position: days?.length ?? 0,
    };
    await db.routineDays.add(day);
  }

  async function renameDay(dayId: string, name: string) {
    await db.routineDays.update(dayId, { name });
  }

  async function removeDay(dayId: string) {
    await db.transaction('rw', db.routineDays, db.routineExercises, async () => {
      await db.routineExercises.where('routineDayId').equals(dayId).delete();
      await db.routineDays.delete(dayId);
    });
    // Close the gap so positions stay contiguous.
    const rest = (days ?? []).filter((d) => d.id !== dayId);
    await db.routineDays.bulkPut(rest.map((d, i) => ({ ...d, position: i })));
  }

  async function moveDay(dayId: string, direction: -1 | 1) {
    const ordered = [...(days ?? [])];
    const index = ordered.findIndex((d) => d.id === dayId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await db.routineDays.bulkPut(ordered.map((d, i) => ({ ...d, position: i })));
  }

  async function addExercise(dayId: string, exerciseId: string) {
    const existing = items!.filter((i) => i.routineDayId === dayId);
    const item: RoutineExercise = {
      id: newId(),
      routineDayId: dayId,
      exerciseId,
      position: existing.length,
      supersetGroup: null,
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      targetRpe: 8,
      restSeconds: 120,
    };
    await db.routineExercises.add(item);
  }

  async function moveItem(dayId: string, itemId: string, direction: -1 | 1) {
    const ordered = items!
      .filter((i) => i.routineDayId === dayId)
      .sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((i) => i.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await db.routineExercises.bulkPut(ordered.map((i, position) => ({ ...i, position })));
  }

  async function removeItem(itemId: string, dayId: string) {
    await db.routineExercises.delete(itemId);
    const rest = items!
      .filter((i) => i.routineDayId === dayId && i.id !== itemId)
      .sort((a, b) => a.position - b.position);
    await db.routineExercises.bulkPut(rest.map((i, position) => ({ ...i, position })));
  }

  async function deleteRoutine() {
    const dayIds = days!.map((d) => d.id);
    await db.transaction('rw', db.routines, db.routineDays, db.routineExercises, async () => {
      await db.routineExercises.where('routineDayId').anyOf(dayIds).delete();
      await db.routineDays.where('routineId').equals(routineId).delete();
      await db.routines.delete(routineId);
    });
    navigate('/plans', { replace: true });
  }

  return (
    <Screen>
      <TopBar
        title={routine.name}
        subtitle={`${days.length} day${days.length === 1 ? '' : 's'}`}
        left={
          <button
            type="button"
            onClick={() => navigate('/plans')}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
      />

      <div className="space-y-3">
        <Field label="Routine name">
          <TextInput
            value={routine.name}
            onChange={(e) => db.routines.update(routineId, { name: e.target.value })}
          />
        </Field>
        <Field label="Notes" hint="Shown under the routine name in the list">
          <TextInput
            value={routine.notes ?? ''}
            placeholder="Mon / Tue / Thu / Fri / Sat"
            onChange={(e) => db.routines.update(routineId, { notes: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-6 space-y-3">
        {days.map((day, dayIndex) => {
          const dayItems = items
            .filter((i) => i.routineDayId === day.id)
            .sort((a, b) => a.position - b.position);

          return (
            <Card key={day.id} className="p-3">
              <div className="flex items-center gap-2">
                <TextInput
                  value={day.name}
                  onChange={(e) => renameDay(day.id, e.target.value)}
                  className="min-h-11 flex-1 font-medium"
                />
                <MoveButtons
                  onUp={() => moveDay(day.id, -1)}
                  onDown={() => moveDay(day.id, 1)}
                  upDisabled={dayIndex === 0}
                  downDisabled={dayIndex === days.length - 1}
                />
              </div>

              <div className="mt-2 space-y-1.5">
                {dayItems.map((item, index) => {
                  const previous = index > 0 ? dayItems[index - 1] : null;
                  const isGroupStart =
                    !!item.supersetGroup && previous?.supersetGroup !== item.supersetGroup;

                  return (
                    <div key={item.id}>
                      {isGroupStart ? (
                        <div className="pt-1 pl-2 text-[10px] font-semibold tracking-widest text-iron/70 uppercase">
                          Superset {item.supersetGroup}
                        </div>
                      ) : null}
                      <div
                        className={cx(
                          'flex items-center gap-2 rounded-lg bg-raised px-2 py-1.5',
                          item.supersetGroup ? 'ml-2 border-l-2 border-l-iron/50' : '',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="min-w-0 flex-1 py-1 text-left"
                        >
                          <span className="block truncate text-sm">
                            {exercises.get(item.exerciseId)?.name ?? 'Unknown'}
                          </span>
                          <span className="block text-[11px] text-faint">
                            {item.targetSets} × {item.repMin}-{item.repMax}
                            {item.targetRpe ? ` @ RPE ${item.targetRpe}` : ''} ·{' '}
                            {formatClock(item.restSeconds)} rest
                          </span>
                        </button>
                        <MoveButtons
                          onUp={() => moveItem(day.id, item.id, -1)}
                          onDown={() => moveItem(day.id, item.id, 1)}
                          upDisabled={index === 0}
                          downDisabled={index === dayItems.length - 1}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(item.id, day.id)}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-faint active:bg-line"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setPickingForDay(day.id)}
                className="mt-2 flex w-full min-h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-xs font-medium text-muted active:bg-raised"
              >
                <PlusIcon className="size-4" /> Add exercise
              </button>

              <button
                type="button"
                onClick={() => removeDay(day.id)}
                className="mt-2 w-full py-1.5 text-center text-[11px] text-faint active:text-danger"
              >
                Remove day
              </button>
            </Card>
          );
        })}
      </div>

      <Button variant="outline" className="mt-3 w-full" onClick={addDay}>
        <PlusIcon className="size-5" /> Add day
      </Button>

      <div className="mt-6">
        {confirmDelete ? (
          <ConfirmRow
            message="Delete this routine and all of its days? Logged sessions are kept."
            confirmLabel="Delete routine"
            onConfirm={deleteRoutine}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 text-center text-sm text-faint active:text-danger"
          >
            Delete routine
          </button>
        )}
      </div>

      <ExercisePicker
        open={pickingForDay !== null}
        onClose={() => setPickingForDay(null)}
        onPick={async (exercise) => {
          if (pickingForDay) await addExercise(pickingForDay, exercise.id);
          setPickingForDay(null);
        }}
      />

      {editing ? (
        <PrescriptionSheet
          item={editing}
          name={exercises.get(editing.exerciseId)?.name ?? 'Exercise'}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

function MoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  // Arrows rather than drag: dragging a list item on a touch screen fights the
  // page scroll, and this list is edited rarely and deliberately.
  return (
    <span className="flex shrink-0 gap-0.5">
      <button
        type="button"
        onClick={onUp}
        disabled={upDisabled}
        className="flex size-8 items-center justify-center rounded-md text-muted active:bg-line disabled:opacity-25"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 14 6-6 6 6" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={downDisabled}
        className="flex size-8 items-center justify-center rounded-md text-muted active:bg-line disabled:opacity-25"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 10 6 6 6-6" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

function PrescriptionSheet({
  item,
  name,
  onClose,
}: {
  item: RoutineExercise;
  name: string;
  onClose: () => void;
}) {
  const [sets, setSets] = useState(item.targetSets);
  const [repMin, setRepMin] = useState(item.repMin);
  const [repMax, setRepMax] = useState(item.repMax);
  const [rpe, setRpe] = useState<number | null>(item.targetRpe ?? null);
  const [rest, setRest] = useState(item.restSeconds);
  const [superset, setSuperset] = useState<string | null>(item.supersetGroup ?? null);

  async function save() {
    await db.routineExercises.update(item.id, {
      targetSets: sets,
      repMin: Math.min(repMin, repMax),
      repMax: Math.max(repMin, repMax),
      targetRpe: rpe,
      restSeconds: rest,
      supersetGroup: superset,
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Stepper label="Sets" value={sets} onChange={setSets} min={1} max={12} />
          <Stepper label="Min reps" value={repMin} onChange={setRepMin} min={1} max={50} />
          <Stepper label="Max reps" value={repMax} onChange={setRepMax} min={1} max={50} />
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-widest text-faint uppercase">
            Target RPE
          </div>
          <div className="flex gap-1">
            {[6, 7, 8, 9, 10].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRpe(rpe === value ? null : value)}
                className={cx(
                  'tabular h-11 flex-1 rounded-lg text-sm font-semibold',
                  rpe === value ? 'bg-iron text-ink' : 'bg-raised text-muted active:bg-line',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <Stepper
          label="Rest"
          value={rest}
          onChange={setRest}
          step={15}
          min={0}
          max={600}
          format={formatClock}
          suffix="min:sec"
        />

        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-widest text-faint uppercase">
            Superset group
          </div>
          <p className="mb-1.5 text-[11px] text-faint">
            Consecutive exercises sharing a letter are performed as one block.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setSuperset(null)}
              className={cx(
                'h-11 flex-1 rounded-lg text-sm font-medium',
                superset === null ? 'bg-iron text-ink' : 'bg-raised text-muted active:bg-line',
              )}
            >
              None
            </button>
            {SUPERSET_LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => setSuperset(letter)}
                className={cx(
                  'h-11 flex-1 rounded-lg text-sm font-semibold',
                  superset === letter ? 'bg-iron text-ink' : 'bg-raised text-muted active:bg-line',
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        {repMin > repMax ? (
          <Chip tone="gold">Rep range is inverted — it will be swapped on save</Chip>
        ) : null}

        <Button variant="primary" className="w-full" onClick={save}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}
