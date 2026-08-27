import { useNavigate } from 'react-router-dom';
import type { HistoryEntry } from '../db/queries';
import { fmtKm, fmtNumber, formatDuration, paceOf } from '../lib/calc';
import { formatDayLabel, formatTime } from '../lib/dates';
import { RUN_TITLE } from '../lib/labels';
import { BarbellIcon, ShoeIcon } from './icons';
import { Chip, cx } from './ui';

/**
 * One row of the unified history. Lifts are warm and runs are cool, which is
 * the entire point of merging the two into one list: a glance at the week
 * shows the balance without reading a word.
 */
export function HistoryRow({ entry, showDay = true }: { entry: HistoryEntry; showDay?: boolean }) {
  const navigate = useNavigate();
  const isRun = entry.kind === 'run';

  return (
    <button
      type="button"
      onClick={() => navigate(isRun ? `/run/${entry.id}` : `/session/${entry.id}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3 text-left active:bg-raised"
    >
      <span
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          isRun ? 'bg-stride/15 text-stride' : 'bg-iron/15 text-iron',
        )}
      >
        {isRun ? <ShoeIcon className="size-5" /> : <BarbellIcon className="size-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">
            {isRun ? RUN_TITLE[entry.run.runType] : entry.workout.name}
          </span>
          {!isRun && entry.prCount > 0 ? (
            <Chip tone="gold">{entry.prCount} PR{entry.prCount > 1 ? 's' : ''}</Chip>
          ) : null}
        </span>
        <span className="tabular mt-0.5 block truncate text-xs text-muted">
          {isRun ? <RunSummary entry={entry} /> : <LiftSummary entry={entry} />}
        </span>
      </span>

      <span className="shrink-0 text-right text-[11px] text-faint">
        {showDay ? <span className="block">{formatDayLabel(entry.localDate)}</span> : null}
        <span className="block">{formatTime(entry.startedAt)}</span>
      </span>
    </button>
  );
}

function LiftSummary({ entry }: { entry: Extract<HistoryEntry, { kind: 'workout' }> }) {
  return (
    <>
      {entry.workingSets} sets · {entry.exerciseCount}{' '}
      {entry.exerciseCount === 1 ? 'exercise' : 'exercises'} ·{' '}
      {fmtNumber(Math.round(entry.volumeKg))} kg
      {entry.durationSec ? ` · ${Math.round(entry.durationSec / 60)} min` : ''}
    </>
  );
}

function RunSummary({ entry }: { entry: Extract<HistoryEntry, { kind: 'run' }> }) {
  const { run } = entry;
  return (
    <>
      {fmtKm(run.distanceKm)} km · {formatDuration(run.durationSec)} ·{' '}
      {paceOf(run.distanceKm, run.durationSec)}
      {entry.intervals.length > 0 ? ` · ${entry.intervals.length} reps` : ''}
    </>
  );
}
