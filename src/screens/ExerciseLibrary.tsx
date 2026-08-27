import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Equipment, Exercise, MuscleGroup } from '../db/types';
import { EQUIPMENT, MUSCLE_GROUPS } from '../db/types';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../lib/labels';
import { Stepper } from '../components/Stepper';
import {
  Button,
  Chip,
  Field,
  Screen,
  Sheet,
  Select,
  TextInput,
  TopBar,
  cx,
} from '../components/ui';
import { ChevronLeft, ChevronRight, PlusIcon } from '../components/icons';

export function ExerciseLibrary() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);

  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], undefined);

  const grouped = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    const kept = exercises.filter(
      (e) =>
        (showArchived ? e.isArchived : !e.isArchived) &&
        (q === '' || e.name.toLowerCase().includes(q)),
    );
    const byMuscle = new Map<MuscleGroup, Exercise[]>();
    for (const exercise of kept) {
      const list = byMuscle.get(exercise.muscleGroup) ?? [];
      list.push(exercise);
      byMuscle.set(exercise.muscleGroup, list);
    }
    return MUSCLE_GROUPS.filter((m) => byMuscle.has(m)).map(
      (m) => [m, byMuscle.get(m)!] as const,
    );
  }, [exercises, query, showArchived]);

  const archivedCount = (exercises ?? []).filter((e) => e.isArchived).length;

  return (
    <Screen>
      <TopBar
        title="Exercises"
        subtitle={`${(exercises ?? []).filter((e) => !e.isArchived).length} active`}
        left={
          <button
            type="button"
            onClick={() => navigate('/plans')}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        right={
          <Button variant="primary" className="min-h-10 px-3 text-sm" onClick={() => setEditing('new')}>
            <PlusIcon className="size-4" /> New
          </Button>
        }
      />

      <TextInput
        placeholder="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      {archivedCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="mt-2 text-[11px] font-medium text-muted"
        >
          {showArchived ? 'Show active exercises' : `Show ${archivedCount} archived`}
        </button>
      ) : null}

      <div className="mt-4 space-y-5">
        {grouped.map(([muscle, list]) => (
          <section key={muscle}>
            <h2 className="mb-1.5 text-xs font-semibold tracking-widest text-faint uppercase">
              {MUSCLE_LABEL[muscle]}
            </h2>
            <div className="space-y-1.5">
              {list.map((exercise) => (
                <div
                  key={exercise.id}
                  className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/exercises/${exercise.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{exercise.name}</span>
                      {exercise.isCustom ? <Chip tone="iron">Custom</Chip> : null}
                    </span>
                    <span className="block text-[11px] text-faint">
                      {EQUIPMENT_LABEL[exercise.equipment]} · {exercise.incrementKg} kg steps
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(exercise)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted active:bg-raised"
                  >
                    Edit
                  </button>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </div>
              ))}
            </div>
          </section>
        ))}
        {grouped.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">Nothing matches that search.</p>
        ) : null}
      </div>

      {editing ? (
        <ExerciseSheet
          exercise={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

function ExerciseSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(exercise?.muscleGroup ?? 'chest');
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'barbell');
  const [increment, setIncrement] = useState(exercise?.incrementKg ?? 2.5);
  const [notes, setNotes] = useState(exercise?.notes ?? '');

  const usageCount = useLiveQuery(
    async () => (exercise ? db.sets.where('exerciseId').equals(exercise.id).count() : 0),
    [exercise?.id],
    undefined,
  );

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (exercise) {
      await db.exercises.update(exercise.id, {
        name: trimmed,
        muscleGroup,
        equipment,
        incrementKg: increment,
        notes: notes.trim() || undefined,
        updatedAt: now,
      });
    } else {
      await db.exercises.add({
        id: newId(),
        name: trimmed,
        muscleGroup,
        equipment,
        incrementKg: increment,
        isCustom: true,
        isArchived: false,
        notes: notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    onClose();
  }

  async function toggleArchive() {
    if (!exercise) return;
    await db.exercises.update(exercise.id, {
      isArchived: !exercise.isArchived,
      updatedAt: Date.now(),
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={exercise ? 'Edit exercise' : 'New exercise'}>
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus={!exercise} />
        </Field>

        <div className="flex gap-2">
          <Field label="Muscle group" className="flex-1">
            <Select
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Equipment" className="flex-1">
            <Select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
              {EQUIPMENT.map((eq) => (
                <option key={eq} value={eq}>
                  {EQUIPMENT_LABEL[eq]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Stepper
          label="Smallest step"
          value={increment}
          onChange={setIncrement}
          step={0.25}
          min={0.25}
          max={25}
          suffix="kg — drives the weight stepper"
        />

        <Field label="Notes">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Setup cues, seat height…"
          />
        </Field>

        <Button variant="primary" className="w-full" onClick={save} disabled={!name.trim()}>
          {exercise ? 'Save changes' : 'Add exercise'}
        </Button>

        {exercise ? (
          <>
            <button
              type="button"
              onClick={toggleArchive}
              className={cx(
                'w-full py-3 text-center text-sm',
                exercise.isArchived ? 'text-good' : 'text-faint active:text-danger',
              )}
            >
              {exercise.isArchived ? 'Restore to library' : 'Archive exercise'}
            </button>
            <p className="text-center text-[11px] text-faint">
              {usageCount === undefined
                ? ''
                : usageCount > 0
                  ? `Used in ${usageCount} logged set${usageCount === 1 ? '' : 's'}. Archiving hides it from pickers and keeps every one of them.`
                  : 'Not used in any logged set yet.'}
            </p>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
