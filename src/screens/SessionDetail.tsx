import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import { getExerciseMap, getWorkoutEntry } from '../db/queries';
import type { Workout, WorkoutSet } from '../db/types';
import { recomputeExercisePrs, PR_SHORT } from '../lib/prs';
import { epley1RM, fmtKg, fmtNumber } from '../lib/calc';
import { formatDate, formatTime, localDateOf } from '../lib/dates';
import { SET_TYPE_LABEL } from '../lib/labels';
import {
  Button,
  Card,
  Chip,
  ConfirmRow,
  Screen,
  SectionTitle,
  Stat,
  TopBar,
} from '../components/ui';
import { ChevronLeft, NoteIcon, TrophyIcon } from '../components/icons';

export function SessionDetail() {
  const { workoutId = '' } = useParams();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entry = useLiveQuery(() => getWorkoutEntry(workoutId), [workoutId], undefined);
  const exercises = useLiveQuery(() => getExerciseMap(), [], undefined);

  if (entry === undefined || exercises === undefined) {
    return (
      <Screen>
        <TopBar title="Session" />
      </Screen>
    );
  }

  if (entry === null) {
    return (
      <Screen>
        <TopBar title="Session" />
        <p className="text-muted">That session no longer exists.</p>
      </Screen>
    );
  }

  const { workout, sets } = entry;

  // Preserve the order the exercises were actually worked in.
  const order: string[] = [];
  for (const set of sets) if (!order.includes(set.exerciseId)) order.push(set.exerciseId);

  async function repeat() {
    const startedAt = Date.now();
    const next: Workout = {
      id: newId(),
      routineId: workout.routineId ?? null,
      routineDayId: workout.routineDayId ?? null,
      name: workout.name,
      startedAt,
      localDate: localDateOf(startedAt),
      status: 'in_progress',
      bodyWeightKg: null,
      // Carry the lineup so a repeat of a blank session is not an empty screen.
      plannedExerciseIds: order,
    };
    await db.workouts.add(next);
    navigate(`/workout/${next.id}`);
  }

  async function remove() {
    const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.sets.where('workoutId').equals(workoutId).delete();
      await db.workouts.delete(workoutId);
    });
    // Records held by this session have to give way to the next best.
    for (const id of exerciseIds) await recomputeExercisePrs(id);
    navigate('/history', { replace: true });
  }

  return (
    <Screen>
      <TopBar
        title={workout.name}
        subtitle={`${formatDate(workout.localDate)} · ${formatTime(workout.startedAt)}`}
        left={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Sets" value={entry.workingSets} tone="iron" />
        <Stat label="Volume" value={fmtNumber(Math.round(entry.volumeKg))} unit="kg" />
        <Stat
          label="Time"
          value={entry.durationSec ? Math.round(entry.durationSec / 60) : '--'}
          unit={entry.durationSec ? 'min' : undefined}
        />
        <Stat label="PRs" value={entry.prCount} tone="gold" />
      </div>

      <SectionTitle>Exercises</SectionTitle>
      <div className="space-y-2">
        {order.map((exerciseId) => {
          const exercise = exercises.get(exerciseId);
          const exerciseSets = sets.filter((s) => s.exerciseId === exerciseId);
          return (
            <Card key={exerciseId} className="p-3">
              <button
                type="button"
                onClick={() => navigate(`/exercises/${exerciseId}`)}
                className="mb-2 block w-full text-left font-medium"
              >
                {exercise?.name ?? 'Unknown exercise'}
              </button>
              <div className="space-y-1">
                {exerciseSets.map((set) => (
                  <ReviewSetRow key={set.id} set={set} />
                ))}
              </div>
            </Card>
          );
        })}
        {order.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No sets were logged in this session.</p>
        ) : null}
      </div>

      {workout.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card className="p-3 text-sm text-muted">{workout.notes}</Card>
        </>
      ) : null}

      <Button variant="primary" className="mt-6 w-full" onClick={repeat}>
        Repeat this session
      </Button>

      <div className="mt-3">
        {confirmDelete ? (
          <ConfirmRow
            message="Delete this session and all of its sets?"
            confirmLabel="Delete session"
            onConfirm={remove}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 text-center text-sm text-faint active:text-danger"
          >
            Delete session
          </button>
        )}
      </div>
    </Screen>
  );
}

function ReviewSetRow({ set }: { set: WorkoutSet }) {
  const e1rm = epley1RM(set.weightKg, set.reps);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-raised/60 px-2.5 py-2">
      <span className="tabular w-5 shrink-0 text-center text-xs text-faint">{set.setNumber}</span>
      <span className="tabular min-w-0 flex-1 text-sm">
        <span className="font-semibold">{fmtKg(set.weightKg)}</span>
        <span className="text-xs text-muted"> kg × </span>
        <span className="font-semibold">{set.reps}</span>
        {set.rpe ? <span className="text-xs text-muted"> @ {set.rpe}</span> : null}
        {set.setType !== 'working' ? (
          <span className="ml-1.5 text-[10px] text-faint">{SET_TYPE_LABEL[set.setType]}</span>
        ) : null}
        {set.note ? (
          <span className="mt-0.5 flex items-start gap-1 text-[11px] text-faint">
            <NoteIcon className="mt-px size-3 shrink-0" />
            {set.note}
          </span>
        ) : null}
      </span>
      {set.prTypes?.map((type) => (
        <Chip key={type} tone="gold">
          <TrophyIcon className="size-3" />
          {PR_SHORT[type]}
        </Chip>
      ))}
      {e1rm ? <span className="tabular text-[10px] text-faint">~{fmtKg(Math.round(e1rm))}</span> : null}
    </div>
  );
}
