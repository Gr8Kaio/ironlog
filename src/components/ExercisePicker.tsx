import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Exercise, MuscleGroup } from '../db/types';
import { MUSCLE_LABEL, EQUIPMENT_LABEL } from '../lib/labels';
import { Sheet, TextInput, cx } from './ui';

/** Shared by the logger and the routine editor so the search behaves identically. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  excludeIds = [],
  title = 'Add exercise',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  excludeIds?: string[];
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [], undefined);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  const results = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        !e.isArchived &&
        !excluded.has(e.id) &&
        (muscle === 'all' || e.muscleGroup === muscle) &&
        (q === '' || e.name.toLowerCase().includes(q)),
    );
  }, [exercises, query, muscle, excluded]);

  const muscles = useMemo(() => {
    const present = new Set((exercises ?? []).filter((e) => !e.isArchived).map((e) => e.muscleGroup));
    return [...present].sort((a, b) => MUSCLE_LABEL[a].localeCompare(MUSCLE_LABEL[b]));
  }, [exercises]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <TextInput
        placeholder="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <FilterPill active={muscle === 'all'} onClick={() => setMuscle('all')}>
          All
        </FilterPill>
        {muscles.map((m) => (
          <FilterPill key={m} active={muscle === m} onClick={() => setMuscle(m)}>
            {MUSCLE_LABEL[m]}
          </FilterPill>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {results.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => {
              onPick(exercise);
              setQuery('');
            }}
            className="flex w-full min-h-14 items-center gap-3 rounded-xl bg-raised px-3 text-left active:bg-line"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{exercise.name}</span>
              <span className="block text-xs text-faint">
                {MUSCLE_LABEL[exercise.muscleGroup]} · {EQUIPMENT_LABEL[exercise.equipment]}
              </span>
            </span>
          </button>
        ))}
        {results.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            Nothing matches. Add a custom exercise from the library.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-9 shrink-0 rounded-full px-3 text-xs font-medium whitespace-nowrap',
        active ? 'bg-iron text-ink' : 'bg-raised text-muted',
      )}
    >
      {children}
    </button>
  );
}
