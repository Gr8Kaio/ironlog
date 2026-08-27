import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, newId } from '../db/db';
import type { KneeState, Run, RunInterval, RunType, Surface } from '../db/types';
import { KNEE_STATES, RUN_TYPES, SURFACES } from '../db/types';
import { fmtKm, formatDuration, formatPace, paceSecPerKm } from '../lib/calc';
import { localDateOf, toEpoch } from '../lib/dates';
import { KNEE_LABEL, RUN_TYPE_LABEL, SURFACE_LABEL } from '../lib/labels';
import { Stepper } from '../components/Stepper';
import {
  Button,
  Card,
  ConfirmRow,
  Field,
  Screen,
  SectionTitle,
  Segmented,
  TextArea,
  TextInput,
  TopBar,
  cx,
} from '../components/ui';
import { ChevronLeft, PlusIcon, TrashIcon } from '../components/icons';

interface IntervalDraft {
  id: string;
  distanceM: number;
  durationSec: number;
  restSec: number;
  note?: string;
}

export function RunEditor() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const isNew = !runId;

  // Async wrappers, not a ternary over two promise types: mixing Dexie's
  // PromiseExtended with a plain Promise collapses the inferred element type.
  const existing = useLiveQuery(async () => (runId ? await db.runs.get(runId) : undefined), [runId], undefined);
  const existingIntervals = useLiveQuery(
    async (): Promise<RunInterval[]> =>
      runId ? await db.runIntervals.where('runId').equals(runId).sortBy('repNumber') : [],
    [runId],
    undefined,
  );
  const settings = useLiveQuery(() => getSettings(), [], undefined);

  const [localDate, setLocalDate] = useState(() => localDateOf(Date.now()));
  const [time, setTime] = useState('07:00');
  const [distanceKm, setDistanceKm] = useState(5);
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [runType, setRunType] = useState<RunType>('easy');
  const [route, setRoute] = useState('');
  const [notes, setNotes] = useState('');
  const [effort, setEffort] = useState<number | null>(null);
  const [knee, setKnee] = useState<KneeState | null>(null);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [tempC, setTempC] = useState<number | null>(null);
  const [weather, setWeather] = useState('');
  const [intervals, setIntervals] = useState<IntervalDraft[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once from the stored run; later live-query pushes must not stomp
  // on edits in progress.
  useEffect(() => {
    if (loaded || !existing || existingIntervals === undefined) return;
    const started = new Date(existing.startedAt);
    setLocalDate(existing.localDate);
    setTime(`${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`);
    setDistanceKm(existing.distanceKm);
    setMinutes(Math.floor(existing.durationSec / 60));
    setSeconds(existing.durationSec % 60);
    setRunType(existing.runType);
    setRoute(existing.route ?? '');
    setNotes(existing.notes ?? '');
    setEffort(existing.effort ?? null);
    setKnee(existing.kneeFeel ?? null);
    setSurface(existing.surface ?? null);
    setTempC(existing.tempC ?? null);
    setWeather(existing.weather ?? '');
    setIntervals(
      existingIntervals.map((i) => ({
        id: i.id,
        distanceM: i.distanceM,
        durationSec: i.durationSec,
        restSec: i.restSec ?? 0,
        note: i.note,
      })),
    );
    setLoaded(true);
  }, [existing, existingIntervals, loaded]);

  useEffect(() => {
    if (isNew && settings && surface === null) setSurface(settings.defaultSurface);
  }, [isNew, settings, surface]);

  const durationSec = minutes * 60 + seconds;
  const pace = paceSecPerKm(distanceKm, durationSec);

  const intervalTotals = useMemo(() => {
    const distance = intervals.reduce((t, i) => t + i.distanceM, 0);
    const duration = intervals.reduce((t, i) => t + i.durationSec, 0);
    return { distance, duration };
  }, [intervals]);

  async function save() {
    const startedAt = toEpoch(localDate, time);
    const run: Run = {
      id: runId ?? newId(),
      startedAt,
      localDate,
      distanceKm,
      durationSec,
      runType,
      route: route.trim() || undefined,
      notes: notes.trim() || undefined,
      effort,
      kneeFeel: knee,
      surface,
      tempC,
      weather: weather.trim() || undefined,
    };

    await db.transaction('rw', db.runs, db.runIntervals, async () => {
      await db.runs.put(run);
      await db.runIntervals.where('runId').equals(run.id).delete();
      if (runType === 'intervals' && intervals.length > 0) {
        await db.runIntervals.bulkAdd(
          intervals.map((draft, index) => ({
            id: draft.id,
            runId: run.id,
            repNumber: index + 1,
            distanceM: draft.distanceM,
            durationSec: draft.durationSec,
            restSec: draft.restSec || null,
            note: draft.note,
          })),
        );
      }
    });

    navigate('/history', { replace: true });
  }

  async function remove() {
    if (!runId) return;
    await db.transaction('rw', db.runs, db.runIntervals, async () => {
      await db.runIntervals.where('runId').equals(runId).delete();
      await db.runs.delete(runId);
    });
    navigate('/history', { replace: true });
  }

  function addReps(count: number, distanceM: number) {
    setIntervals((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => ({
        id: newId(),
        distanceM,
        durationSec: 0,
        restSec: 90,
      })),
    ]);
  }

  return (
    <Screen>
      <TopBar
        title={isNew ? 'Log a run' : 'Edit run'}
        left={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        right={
          <Button variant="run" className="min-h-10 px-4 text-sm" onClick={save}>
            Save
          </Button>
        }
      />

      {/* Distance and time in, pace out. Pace is never an input. */}
      <Card className="p-3">
        <Stepper
          label="Distance"
          value={distanceKm}
          onChange={setDistanceKm}
          step={0.1}
          min={0}
          max={300}
          format={fmtKm}
          suffix="km"
          tone="stride"
          size="lg"
        />
        <div className="mt-2">
          <div className="flex gap-2">
            <Stepper
              label="Min"
              value={minutes}
              onChange={setMinutes}
              step={1}
              min={0}
              max={900}
              tone="stride"
              size="lg"
            />
            <Stepper
              label="Sec"
              value={seconds}
              onChange={setSeconds}
              step={5}
              min={0}
              max={59}
              format={(v) => String(v).padStart(2, '0')}
              tone="stride"
              size="lg"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-ink px-3 py-2.5">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Average pace
            </div>
            <div className="tabular mt-0.5 text-2xl leading-none font-semibold text-stride">
              {formatPace(pace)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Duration
            </div>
            <div className="tabular mt-0.5 text-2xl leading-none font-semibold">
              {formatDuration(durationSec)}
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle>Type</SectionTitle>
      <Segmented
        options={RUN_TYPES.map((value) => ({ value, label: RUN_TYPE_LABEL[value] }))}
        value={runType}
        onChange={setRunType}
      />

      {runType === 'intervals' ? (
        <IntervalEditor
          intervals={intervals}
          setIntervals={setIntervals}
          onQuickAdd={addReps}
          totals={intervalTotals}
        />
      ) : null}

      <SectionTitle>When</SectionTitle>
      <div className="flex gap-2">
        <Field label="Date" className="flex-1">
          <TextInput type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
        </Field>
        <Field label="Start" className="w-32">
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <SectionTitle>How it felt</SectionTitle>
      <Card className="space-y-4 p-3">
        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            Perceived effort
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setEffort(effort === value ? null : value)}
                className={cx(
                  'tabular h-10 flex-1 rounded-lg text-sm font-semibold',
                  effort === value ? 'bg-stride text-ink' : 'bg-raised text-muted active:bg-line',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Knee</div>
          <div className="flex gap-1.5">
            {KNEE_STATES.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setKnee(knee === state ? null : state)}
                className={cx(
                  'min-h-11 flex-1 rounded-lg text-sm font-medium',
                  knee === state ? 'bg-stride text-ink' : 'bg-raised text-muted active:bg-line',
                )}
              >
                {KNEE_LABEL[state]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            Surface
          </div>
          <div className="flex gap-1.5">
            {SURFACES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSurface(surface === value ? null : value)}
                className={cx(
                  'min-h-11 flex-1 rounded-lg text-sm font-medium',
                  surface === value ? 'bg-stride text-ink' : 'bg-raised text-muted active:bg-line',
                )}
              >
                {SURFACE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <div className="space-y-3">
        <Field label="Route">
          <TextInput
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="River loop"
          />
        </Field>
        <div className="flex gap-2">
          <Field label="Temp" className="w-28">
            <TextInput
              type="number"
              inputMode="numeric"
              value={tempC ?? ''}
              onChange={(e) => setTempC(e.target.value === '' ? null : Number(e.target.value))}
              placeholder="°C"
            />
          </Field>
          <Field label="Weather" className="flex-1">
            <TextInput
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="Clear, windy…"
            />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How it went"
          />
        </Field>
      </div>

      <div className="mt-6">
        {!isNew ? (
          confirmDelete ? (
            <ConfirmRow
              message="Delete this run permanently?"
              confirmLabel="Delete run"
              onConfirm={remove}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 text-center text-sm text-faint active:text-danger"
            >
              Delete run
            </button>
          )
        ) : null}
      </div>
    </Screen>
  );
}

// ----------------------------------------------------------------- intervals

function IntervalEditor({
  intervals,
  setIntervals,
  onQuickAdd,
  totals,
}: {
  intervals: IntervalDraft[];
  setIntervals: React.Dispatch<React.SetStateAction<IntervalDraft[]>>;
  onQuickAdd: (count: number, distanceM: number) => void;
  totals: { distance: number; duration: number };
}) {
  const [count, setCount] = useState(6);
  const [distance, setDistance] = useState(800);

  const update = (id: string, patch: Partial<IntervalDraft>) =>
    setIntervals((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <>
      <SectionTitle
        action={
          intervals.length > 0 ? (
            <span className="tabular text-[11px] text-faint">
              {(totals.distance / 1000).toFixed(1)} km of reps · {formatDuration(totals.duration)}
            </span>
          ) : null
        }
      >
        Repeats
      </SectionTitle>

      <Card className="p-3">
        {intervals.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold tracking-widest text-faint uppercase">
              <span className="w-5" />
              <span className="flex-1">Distance</span>
              <span className="w-16 text-center">Time</span>
              <span className="w-14 text-center">Rest</span>
              <span className="w-20 text-right">Split</span>
              <span className="w-7" />
            </div>
            {intervals.map((rep, index) => (
              <IntervalRow
                key={rep.id}
                index={index}
                rep={rep}
                onChange={(patch) => update(rep.id, patch)}
                onRemove={() => setIntervals((prev) => prev.filter((i) => i.id !== rep.id))}
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-faint">
            No repeats yet. Add a block and fill in the times.
          </p>
        )}

        <div className="mt-3 flex items-end gap-2 border-t border-line-soft pt-3">
          <Stepper label="Reps" value={count} onChange={setCount} min={1} max={40} tone="stride" />
          <Stepper
            label="Distance"
            value={distance}
            onChange={setDistance}
            step={100}
            min={100}
            max={10000}
            suffix="m"
            tone="stride"
          />
          <Button variant="run" className="min-h-14 px-3" onClick={() => onQuickAdd(count, distance)}>
            <PlusIcon className="size-5" />
          </Button>
        </div>
      </Card>
    </>
  );
}

function IntervalRow({
  index,
  rep,
  onChange,
  onRemove,
}: {
  index: number;
  rep: IntervalDraft;
  onChange: (patch: Partial<IntervalDraft>) => void;
  onRemove: () => void;
}) {
  // Split pace is derived from this rep alone, which is the number that says
  // whether the session held together or fell apart.
  const split = paceSecPerKm(rep.distanceM / 1000, rep.durationSec);

  return (
    <div className="flex items-center gap-1.5">
      <span className="tabular w-5 text-center text-xs text-faint">{index + 1}</span>
      <CompactInput
        value={String(rep.distanceM)}
        onChange={(v) => onChange({ distanceM: Number(v) || 0 })}
        suffix="m"
        className="flex-1"
      />
      <CompactInput
        value={secToClock(rep.durationSec)}
        onChange={(v) => onChange({ durationSec: clockToSec(v) })}
        placeholder="0:00"
        className="w-16"
      />
      <CompactInput
        value={rep.restSec ? String(rep.restSec) : ''}
        onChange={(v) => onChange({ restSec: Number(v) || 0 })}
        placeholder="s"
        className="w-14"
      />
      <span className="tabular w-20 text-right text-xs text-stride">{formatPace(split)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint active:bg-line"
      >
        <TrashIcon className="size-3.5" />
      </button>
    </div>
  );
}

function CompactInput({
  value,
  onChange,
  suffix,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <span className={cx('relative flex items-center', className)}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        className="tabular h-11 w-full rounded-lg bg-raised px-2 text-center text-sm focus:outline focus:outline-stride"
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-1.5 text-[10px] text-faint">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

const secToClock = (sec: number) =>
  sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';

/** Accepts `2:44`, `164`, or `2.44` — whatever the thumb produces. */
function clockToSec(input: string): number {
  const text = input.trim().replace('.', ':');
  if (text === '') return 0;
  if (!text.includes(':')) return Number(text) || 0;
  const [m, s] = text.split(':');
  return (Number(m) || 0) * 60 + (Number(s) || 0);
}
