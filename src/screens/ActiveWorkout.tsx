import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, newId } from '../db/db';
import type { Exercise, RoutineExercise, SetType, WorkoutSet } from '../db/types';
import { getLastPerformance, getLatestBodyWeightKg } from '../db/queries';
import { recomputeExercisePrs, PR_SHORT } from '../lib/prs';
import {
  epley1RM,
  fmtKg,
  formatClock,
  formatDuration,
  loadLabel,
  loadLabelShort,
  setLoad,
} from '../lib/calc';
import { formatDateShort } from '../lib/dates';
import { SET_TYPE_LABEL } from '../lib/labels';
import { Stepper } from '../components/Stepper';
import { PlateMath } from '../components/PlateMath';
import { ExercisePicker } from '../components/ExercisePicker';
import { useRestTimer } from '../hooks/useRestTimer';
import {
  Button,
  Chip,
  ConfirmRow,
  Screen,
  Sheet,
  TextArea,
  TopBar,
  cx,
} from '../components/ui';
import {
  CheckIcon,
  ChevronLeft,
  NoteIcon,
  PlateIcon,
  PlusIcon,
  TimerIcon,
  TrashIcon,
  TrophyIcon,
} from '../components/icons';

export function ActiveWorkout() {
  const { workoutId = '' } = useParams();
  const navigate = useNavigate();
  const timer = useRestTimer();

  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId], undefined);
  const sets = useLiveQuery(
    () => db.sets.where('workoutId').equals(workoutId).sortBy('completedAt'),
    [workoutId],
    undefined,
  );
  const prescriptions = useLiveQuery(
    async () =>
      workout?.routineDayId
        ? (await db.routineExercises.where('routineDayId').equals(workout.routineDayId).toArray()).sort(
            (a, b) => a.position - b.position,
          )
        : [],
    [workout?.routineDayId],
    undefined,
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  // Stamped onto every bodyweight set as it is logged, so a pull-up carries a
  // real load and a later weigh-in cannot rewrite what old sets were worth.
  const bodyWeightKg = useLiveQuery(() => getLatestBodyWeightKg(), [], undefined);

  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showSessionNote, setShowSessionNote] = useState(false);
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    if (!workout) return;
    const tick = () => setElapsed(formatDuration((Date.now() - workout.startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [workout]);

  const exerciseById = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e])),
    [exercises],
  );

  /**
   * Order: the routine day first, then anything added ad hoc, then anything
   * that only exists because sets were logged against it. That last case
   * matters when a routine is edited after a session has already started.
   */
  const lineup = useMemo(() => {
    const ids: string[] = [];
    for (const p of prescriptions ?? []) ids.push(p.exerciseId);
    for (const id of workout?.plannedExerciseIds ?? []) if (!ids.includes(id)) ids.push(id);
    for (const s of sets ?? []) if (!ids.includes(s.exerciseId)) ids.push(s.exerciseId);
    return ids;
  }, [prescriptions, workout?.plannedExerciseIds, sets]);

  const prescriptionFor = useCallback(
    (exerciseId: string) => (prescriptions ?? []).find((p) => p.exerciseId === exerciseId) ?? null,
    [prescriptions],
  );

  // Open the first exercise that still owes sets, so the screen lands on the
  // thing to do next without a tap.
  useEffect(() => {
    if (openId !== null || !sets || !prescriptions || lineup.length === 0) return;
    const next =
      lineup.find((id) => {
        const done = sets.filter((s) => s.exerciseId === id).length;
        const target = prescriptionFor(id)?.targetSets ?? 0;
        return done < target;
      }) ?? lineup[0];
    setOpenId(next);
  }, [openId, sets, prescriptions, lineup, prescriptionFor]);

  // bodyWeightKg is in the guard because a set logged before it resolves would
  // be stamped with a zero it can never get back.
  if (
    workout === undefined ||
    sets === undefined ||
    exercises === undefined ||
    bodyWeightKg === undefined ||
    !settings
  ) {
    return (
      <Screen>
        <TopBar title="Session" />
      </Screen>
    );
  }

  if (workout === null) {
    return (
      <Screen>
        <TopBar title="Session" />
        <p className="text-muted">That session no longer exists.</p>
      </Screen>
    );
  }

  async function logSet(
    exercise: Exercise,
    values: { weightKg: number; reps: number; rpe: number | null; setType: SetType; note?: string },
  ) {
    const existing = (sets ?? []).filter((s) => s.exerciseId === exercise.id);
    const set: WorkoutSet = {
      id: newId(),
      workoutId,
      exerciseId: exercise.id,
      setNumber: existing.length + 1,
      weightKg: values.weightKg,
      reps: values.reps,
      rpe: values.rpe,
      setType: values.setType,
      bodyWeightKg: exercise.equipment === 'bodyweight' ? (bodyWeightKg ?? 0) : null,
      note: values.note,
      completedAt: Date.now(),
      prTypes: [],
    };
    await db.sets.add(set);
    await recomputeExercisePrs(exercise.id);

    const rest = prescriptionFor(exercise.id)?.restSeconds ?? settings!.defaultRestSec;
    timer.start(rest, { label: exercise.name, sound: settings!.soundOnRestEnd });
  }

  async function removeSet(set: WorkoutSet) {
    await db.sets.delete(set.id);
    // Renumber what is left so the sequence never shows a gap.
    const rest = (sets ?? [])
      .filter((s) => s.exerciseId === set.exerciseId && s.id !== set.id)
      .sort((a, b) => a.completedAt - b.completedAt);
    await db.sets.bulkPut(rest.map((s, i) => ({ ...s, setNumber: i + 1 })));
    await recomputeExercisePrs(set.exerciseId);
  }

  /**
   * Only offered for exercises this session added on its own. A routine day's
   * exercises stay put: dropping one here would read as a routine edit, and a
   * session is not allowed to rewrite the routine behind it.
   */
  async function removeExercise(exerciseId: string) {
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.sets
        .where('workoutId')
        .equals(workoutId)
        .and((s) => s.exerciseId === exerciseId)
        .delete();
      await db.workouts.update(workoutId, {
        plannedExerciseIds: (workout?.plannedExerciseIds ?? []).filter((id) => id !== exerciseId),
      });
    });
    await recomputeExercisePrs(exerciseId);
    if (openId === exerciseId) setOpenId(null);
  }

  async function finish() {
    await db.workouts.update(workoutId, { status: 'completed', finishedAt: Date.now() });
    timer.stop();
    navigate(`/session/${workoutId}`, { replace: true });
  }

  async function discard() {
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.sets.where('workoutId').equals(workoutId).delete();
      await db.workouts.delete(workoutId);
    });
    timer.stop();
    navigate('/', { replace: true });
  }

  const totalSets = sets.length;

  return (
    <Screen className={timer.running ? 'pb-44' : 'pb-32'}>
      <TopBar
        title={workout.name}
        subtitle={`${elapsed} · ${totalSets} set${totalSets === 1 ? '' : 's'}`}
        left={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        right={
          <Button variant="primary" className="min-h-10 px-3 text-sm" onClick={finish}>
            <CheckIcon className="size-4" /> Finish
          </Button>
        }
      />

      <div className="space-y-2">
        {lineup.map((exerciseId, index) => {
          const exercise = exerciseById.get(exerciseId);
          if (!exercise) return null;
          const prescription = prescriptionFor(exerciseId);
          const previous = index > 0 ? prescriptionFor(lineup[index - 1]) : null;
          const startsSuperset =
            !!prescription?.supersetGroup &&
            previous?.supersetGroup !== prescription.supersetGroup;

          return (
            <ExerciseBlock
              key={exerciseId}
              exercise={exercise}
              prescription={prescription}
              sets={sets.filter((s) => s.exerciseId === exerciseId)}
              open={openId === exerciseId}
              onToggle={() => setOpenId(openId === exerciseId ? null : exerciseId)}
              onLog={(values) => logSet(exercise, values)}
              onRemove={removeSet}
              onRemoveExercise={prescription ? null : () => removeExercise(exerciseId)}
              workoutId={workoutId}
              bodyWeightKg={bodyWeightKg ?? null}
              supersetLabel={
                prescription?.supersetGroup
                  ? `Superset ${prescription.supersetGroup}`
                  : null
              }
              showSupersetHeader={startsSuperset}
            />
          );
        })}
      </div>

      <Button variant="outline" className="mt-3 w-full" onClick={() => setPicking(true)}>
        <PlusIcon className="size-5" /> Add exercise
      </Button>

      <button
        type="button"
        onClick={() => setShowSessionNote(true)}
        className={cx(
          'mt-2 flex w-full min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-left text-sm active:bg-raised',
          workout.notes ? 'text-fg' : 'text-muted',
        )}
      >
        <NoteIcon className="size-4 shrink-0 text-faint" />
        <span className="truncate">{workout.notes || 'Add a note for this session'}</span>
      </button>

      <div className="mt-6">
        {confirmDiscard ? (
          <ConfirmRow
            message="Discard this session and everything logged in it?"
            confirmLabel="Discard"
            onConfirm={discard}
            onCancel={() => setConfirmDiscard(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            className="w-full py-3 text-center text-sm text-faint active:text-danger"
          >
            Discard session
          </button>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        excludeIds={lineup}
        onPick={async (exercise) => {
          const planned = workout?.plannedExerciseIds ?? [];
          await db.workouts.update(workoutId, {
            plannedExerciseIds: [...planned, exercise.id],
          });
          setOpenId(exercise.id);
          setPicking(false);
        }}
      />

      <Sheet
        open={showSessionNote}
        onClose={() => setShowSessionNote(false)}
        title="Session note"
      >
        <TextArea
          rows={4}
          autoFocus
          defaultValue={workout.notes ?? ''}
          onChange={(e) => db.workouts.update(workoutId, { notes: e.target.value })}
          placeholder="How the session went, what to change next time"
        />
        <Button variant="primary" className="mt-3 w-full" onClick={() => setShowSessionNote(false)}>
          Done
        </Button>
      </Sheet>

      {timer.running ? <RestBar timer={timer} /> : null}
    </Screen>
  );
}

// ------------------------------------------------------------------- blocks

function ExerciseBlock({
  exercise,
  prescription,
  sets,
  open,
  onToggle,
  onLog,
  onRemove,
  onRemoveExercise,
  workoutId,
  bodyWeightKg,
  supersetLabel,
  showSupersetHeader,
}: {
  exercise: Exercise;
  prescription: RoutineExercise | null;
  sets: WorkoutSet[];
  open: boolean;
  onToggle: () => void;
  onLog: (values: {
    weightKg: number;
    reps: number;
    rpe: number | null;
    setType: SetType;
    note?: string;
  }) => Promise<void>;
  onRemove: (set: WorkoutSet) => Promise<void>;
  /** `null` when the exercise comes from the routine day and cannot be dropped. */
  onRemoveExercise: (() => Promise<void>) | null;
  workoutId: string;
  bodyWeightKg: number | null;
  supersetLabel: string | null;
  showSupersetHeader: boolean;
}) {
  const last = useLiveQuery(
    () => getLastPerformance(exercise.id, workoutId),
    [exercise.id, workoutId],
    undefined,
  );

  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const done = sets.length;
  const target = prescription?.targetSets ?? 0;
  const complete = target > 0 && done >= target;

  return (
    <>
      {showSupersetHeader && supersetLabel ? (
        <div className="pt-2 pl-3 text-[10px] font-semibold tracking-widest text-iron/70 uppercase">
          {supersetLabel}
        </div>
      ) : null}

      {/*
        A group needs a boundary, not just a start. An open divider above the
        first member reads as though every exercise below it is in the superset,
        so membership is carried by a left accent on each member instead.
      */}
      <div
        className={cx(
          'overflow-hidden rounded-2xl border bg-surface',
          supersetLabel ? 'ml-2 rounded-l-md border-l-2 border-l-iron/50' : '',
          open ? 'border-iron/40' : 'border-line-soft',
        )}
      >
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left active:bg-raised"
          >
            <span
              className={cx(
                'tabular flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                complete ? 'bg-good/15 text-good' : 'bg-raised text-muted',
              )}
            >
              {complete ? <CheckIcon className="size-4" /> : `${done}/${target || '-'}`}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{exercise.name}</span>
              <span className="block truncate text-xs text-faint">
                {prescription
                  ? `${prescription.targetSets} x ${prescription.repMin}-${prescription.repMax}${
                      prescription.targetRpe ? ` @ RPE ${prescription.targetRpe}` : ''
                    }`
                  : 'No target'}
              </span>
            </span>
          </button>

          {/*
            The count on the confirm button is the whole point of the two taps:
            an exercise picked by mistake goes away quietly, one with sets in it
            has to say how much is about to be lost.
          */}
          {onRemoveExercise ? (
            confirmingRemove ? (
              <span className="flex shrink-0 items-center gap-1 self-center pr-2">
                <button
                  type="button"
                  onClick={onRemoveExercise}
                  className="rounded-md bg-danger/20 px-2 py-1 text-[11px] font-semibold text-danger"
                >
                  {done > 0 ? `Delete ${done} set${done === 1 ? '' : 's'}` : 'Remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-md px-2 py-1 text-[11px] text-muted"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Remove ${exercise.name} from this session`}
                onClick={() => setConfirmingRemove(true)}
                className="flex w-11 shrink-0 items-center justify-center text-faint active:bg-raised"
              >
                <TrashIcon className="size-4" />
              </button>
            )
          ) : null}
        </div>

        {sets.length > 0 ? (
          <div className="space-y-1 px-3 pb-2">
            {sets.map((set) => (
              <SetRow key={set.id} set={set} onRemove={() => onRemove(set)} />
            ))}
          </div>
        ) : null}

        {open ? (
          <SetEditor
            exercise={exercise}
            prescription={prescription}
            last={last ?? null}
            sessionSets={sets}
            bodyWeightKg={bodyWeightKg}
            nextSetNumber={done + 1}
            onLog={onLog}
          />
        ) : null}
      </div>
    </>
  );
}

function SetRow({ set, onRemove }: { set: WorkoutSet; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const e1rm = epley1RM(setLoad(set), set.reps);
  const load = loadLabel(set);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-raised/60 px-2.5 py-2">
      <span className="tabular w-5 shrink-0 text-center text-xs text-faint">{set.setNumber}</span>
      <span className="tabular min-w-0 flex-1 text-sm">
        <span className="font-semibold">{load.value}</span>
        <span className="text-xs text-muted">{load.unit ? ` ${load.unit} × ` : ' × '}</span>
        <span className="font-semibold">{set.reps}</span>
        {set.rpe ? <span className="text-xs text-muted"> @ {set.rpe}</span> : null}
        {set.setType !== 'working' ? (
          <span className="ml-1.5 text-[10px] text-faint">{SET_TYPE_LABEL[set.setType]}</span>
        ) : null}
      </span>

      {set.prTypes?.map((type) => (
        <Chip key={type} tone="gold">
          <TrophyIcon className="size-3" />
          {PR_SHORT[type]}
        </Chip>
      ))}

      {/* Bare number reads as a weight; the tilde marks it as an estimate. */}
      {e1rm ? (
        <span className="tabular text-[10px] text-faint">~{fmtKg(Math.round(e1rm))}</span>
      ) : null}

      {set.note ? <NoteIcon className="size-3.5 shrink-0 text-faint" /> : null}

      {confirming ? (
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md bg-danger/20 px-2 py-1 text-[11px] font-semibold text-danger"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 text-[11px] text-muted"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint active:bg-line"
        >
          <TrashIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- editor

function SetEditor({
  exercise,
  prescription,
  last,
  sessionSets,
  bodyWeightKg,
  nextSetNumber,
  onLog,
}: {
  exercise: Exercise;
  prescription: RoutineExercise | null;
  last: Awaited<ReturnType<typeof getLastPerformance>>;
  sessionSets: WorkoutSet[];
  bodyWeightKg: number | null;
  nextSetNumber: number;
  onLog: (values: {
    weightKg: number;
    reps: number;
    rpe: number | null;
    setType: SetType;
    note?: string;
  }) => Promise<void>;
}) {
  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [setType, setSetType] = useState<SetType>('working');
  const [note, setNote] = useState('');
  const [showPlates, setShowPlates] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * A set starts at the last weight and reps actually used for this exercise:
   * the previous set of this session if there is one, otherwise the final set
   * of the last session it was trained. Adjusting from what you just lifted
   * beats matching set number against a session that may have gone differently.
   */
  const suggestion = useMemo(() => {
    const previous = sessionSets.at(-1) ?? last?.sets?.at(-1) ?? null;
    if (previous) {
      return {
        weightKg: previous.weightKg,
        reps: previous.reps,
        rpe: previous.rpe ?? prescription?.targetRpe ?? null,
      };
    }
    return {
      weightKg: exercise.equipment === 'barbell' ? 20 : 0,
      reps: prescription ? Math.round((prescription.repMin + prescription.repMax) / 2) : 8,
      rpe: prescription?.targetRpe ?? null,
    };
  }, [sessionSets, last, prescription, exercise.equipment]);

  // Re-prefill whenever the suggestion moves on (a set was logged or removed),
  // unless the value has been touched for this set already.
  useEffect(() => {
    setWeight(null);
    setReps(null);
    setRpe(null);
    setNote('');
  }, [nextSetNumber, exercise.id]);

  const isBodyweight = exercise.equipment === 'bodyweight';
  const weightValue = weight ?? suggestion.weightKg;
  const repsValue = reps ?? suggestion.reps;
  const rpeValue = rpe ?? suggestion.rpe;

  // RPE rides along with the load. What a weight cost you is the half of the
  // record that decides whether to add to it, so it belongs on the same line.
  const lastLine = last?.sets?.length
    ? `${last.sets
        .map((s) => `${loadLabelShort(s)}×${s.reps}${s.rpe ? ` @${s.rpe}` : ''}`)
        .join('  ')}${last.localDate ? `  ·  ${formatDateShort(last.localDate)}` : ''}`
    : 'No history for this exercise yet';

  // A set note is written for the next session, so this is where it has to
  // resurface — not buried in a history entry nobody reopens mid-set.
  const lastNotes = (last?.sets ?? []).filter((s) => s.note);

  async function submit() {
    setSaving(true);
    try {
      await onLog({
        weightKg: weightValue,
        reps: repsValue,
        rpe: rpeValue,
        setType,
        note: note.trim() || undefined,
      });
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-line-soft bg-raised/30 px-3 pt-3 pb-3">
      <div className="mb-3 space-y-1.5">
        {exercise.notes ? (
          <p className="flex gap-1.5 rounded-lg rounded-l-sm border-l-2 border-iron/50 bg-raised px-2 py-1.5 text-[11px] text-muted">
            <NoteIcon className="mt-px size-3.5 shrink-0 text-faint" />
            <span>{exercise.notes}</span>
          </p>
        ) : null}

        <div className="tabular flex items-center gap-2 text-[11px] text-faint">
          <span className="shrink-0 font-semibold tracking-wide text-muted uppercase">Last</span>
          <span className="truncate">{lastLine}</span>
        </div>

        {lastNotes.map((s) => (
          <p
            key={s.id}
            className="flex gap-1.5 rounded-lg bg-raised px-2 py-1.5 text-[11px] text-muted"
          >
            <NoteIcon className="mt-px size-3.5 shrink-0 text-faint" />
            <span>
              <span className="text-faint">Set {s.setNumber} · </span>
              {s.note}
            </span>
          </p>
        ))}
      </div>

      <div className="flex gap-2">
        <Stepper
          label={isBodyweight ? 'Added' : 'Weight'}
          value={weightValue}
          onChange={setWeight}
          step={exercise.incrementKg}
          min={0}
          max={500}
          format={isBodyweight ? (v) => (v === 0 ? 'BW' : `+${fmtKg(v)}`) : fmtKg}
          // The suffix carries the number the word stands for, so `BW` is never
          // a mystery: it reads as the total actually being moved.
          suffix={
            isBodyweight
              ? bodyWeightKg
                ? `${fmtKg(bodyWeightKg + weightValue)} kg total`
                : 'log a weigh-in'
              : 'kg'
          }
          size="lg"
        />
        <Stepper
          label="Reps"
          value={repsValue}
          onChange={setReps}
          step={1}
          min={1}
          max={100}
          size="lg"
        />
      </div>

      <div className="mt-2 flex items-stretch gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-xl bg-raised px-2">
          <span className="pl-1 text-[10px] font-semibold tracking-widest text-faint uppercase">
            RPE
          </span>
          <div className="flex flex-1 justify-end gap-1">
            {[6, 7, 8, 9, 10].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRpe(rpeValue === value ? null : value)}
                className={cx(
                  'tabular size-9 rounded-lg text-sm font-semibold',
                  rpeValue === value ? 'bg-iron text-ink' : 'text-muted active:bg-line',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {exercise.equipment === 'barbell' ? (
          <button
            type="button"
            onClick={() => setShowPlates(true)}
            className="flex w-12 items-center justify-center rounded-xl bg-raised text-muted active:bg-line"
          >
            <PlateIcon className="size-5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setShowNote(true)}
          className={cx(
            'flex w-12 items-center justify-center rounded-xl active:bg-line',
            note ? 'bg-iron/15 text-iron' : 'bg-raised text-muted',
          )}
        >
          <NoteIcon className="size-5" />
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <select
          value={setType}
          onChange={(e) => setSetType(e.target.value as SetType)}
          className="min-h-12 w-28 rounded-xl border border-line bg-surface px-2 text-sm text-muted"
        >
          {(['working', 'warmup', 'amrap', 'dropset'] as SetType[]).map((type) => (
            <option key={type} value={type}>
              {SET_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <Button variant="primary" className="flex-1 text-base" onClick={submit} disabled={saving}>
          <PlusIcon className="size-5" /> Log set {nextSetNumber}
        </Button>
      </div>

      <Sheet open={showPlates} onClose={() => setShowPlates(false)} title="Plate math">
        <PlateMath targetKg={weightValue} />
      </Sheet>

      <Sheet open={showNote} onClose={() => setShowNote(false)} title={`Note · set ${nextSetNumber}`}>
        <TextArea
          rows={4}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bar speed, pain, cues, anything worth remembering next time"
        />
        <Button variant="primary" className="mt-3 w-full" onClick={() => setShowNote(false)}>
          Done
        </Button>
      </Sheet>
    </div>
  );
}

// --------------------------------------------------------------- rest timer

function RestBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  const progress = timer.totalSec > 0 ? 1 - timer.remaining / timer.totalSec : 0;
  const done = timer.remaining === 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line bg-surface/95 pb-safe backdrop-blur-lg">
      <div className="h-0.5 w-full bg-line">
        <div
          className={cx('h-full transition-all duration-300', done ? 'bg-good' : 'bg-iron')}
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <TimerIcon className={cx('size-5', done ? 'text-good' : 'text-iron')} />
        <span
          className={cx(
            'tabular w-16 text-xl font-semibold',
            done ? 'text-good' : 'text-fg',
          )}
        >
          {done ? 'Go' : formatClock(timer.remaining)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{timer.label}</span>
        <button
          type="button"
          onClick={() => timer.adjust(-15)}
          className="min-h-10 rounded-lg bg-raised px-2.5 text-xs font-semibold text-muted active:bg-line"
        >
          −15
        </button>
        <button
          type="button"
          onClick={() => timer.adjust(15)}
          className="min-h-10 rounded-lg bg-raised px-2.5 text-xs font-semibold text-muted active:bg-line"
        >
          +15
        </button>
        <button
          type="button"
          onClick={timer.stop}
          className="min-h-10 rounded-lg bg-raised px-3 text-xs font-semibold text-muted active:bg-line"
        >
          {done ? 'Clear' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
