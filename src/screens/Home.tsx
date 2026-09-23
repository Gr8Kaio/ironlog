import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, newId } from '../db/db';
import {
  getActiveWorkout,
  getHistory,
  getLogsForDate,
  getDayOverridesForWeekOf,
  getLogsForWeekOf,
  getNextScheduledDay,
  getPersonalRecords,
  getWeeklyLiftStats,
  getWeeklyRunStats,
} from '../db/queries';
import type { PersonalRecordRow } from '../db/queries';
import type { PrType, Workout } from '../db/types';
import { fmtKg, fmtKm, fmtNumber, loadLabelShort } from '../lib/calc';
import {
  daysBetween,
  formatDate,
  formatDateShort,
  localDateOf,
  relativeDays,
  todayLocalDate,
  weekStart,
} from '../lib/dates';
import {
  assumptionOf,
  buildWeekBudget,
  dayAllowanceKcal,
  fmtKcal,
  fmtGrams,
  totalMacros,
} from '../lib/nutrition';
import { HistoryRow } from '../components/HistoryRow';
import {
  BarbellIcon,
  ChevronRight,
  FlameIcon,
  PlanIcon,
  ScaleIcon,
  ShoeIcon,
  TrophyIcon,
} from '../components/icons';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Stat,
  TopBar,
  cx,
} from '../components/ui';

export function Home() {
  const navigate = useNavigate();
  const [pickingDay, setPickingDay] = useState(false);

  const next = useLiveQuery(() => getNextScheduledDay(), [], undefined);
  const active = useLiveQuery(() => getActiveWorkout(), [], undefined);
  const recent = useLiveQuery(() => getHistory(4), [], undefined);
  const liftWeek = useLiveQuery(() => getWeeklyLiftStats(1), [], undefined);
  const runWeek = useLiveQuery(() => getWeeklyRunStats(1), [], undefined);
  const lastWeight = useLiveQuery(
    () => db.bodyMetrics.orderBy('measuredAt').reverse().filter((m) => m.weightKg != null).first(),
    [],
    undefined,
  );

  // Every day of the active routine, so a session other than the next one
  // scheduled can be started without editing the plan.
  const routineDays = useLiveQuery(
    async () => {
      if (!next) return [];
      return (await db.routineDays.where('routineId').equals(next.routineId).toArray()).sort(
        (a, b) => a.position - b.position,
      );
    },
    [next?.routineId],
    undefined,
  );

  const lifts = liftWeek?.[0];
  const runs = runWeek?.[0];

  async function startWorkout(routineDayId?: string, name?: string) {
    if (active) {
      navigate(`/workout/${active.id}`);
      return;
    }
    const day = routineDayId ? await db.routineDays.get(routineDayId) : null;
    const startedAt = Date.now();
    const workout: Workout = {
      id: newId(),
      routineId: day?.routineId ?? null,
      routineDayId: day?.id ?? null,
      name: name ?? day?.name ?? 'Blank session',
      startedAt,
      localDate: localDateOf(startedAt),
      status: 'in_progress',
      bodyWeightKg: null,
    };
    await db.workouts.add(workout);
    navigate(`/workout/${workout.id}`);
  }

  return (
    <Screen>
      <TopBar title="IronLog" subtitle={formatDate(todayLocalDate())} />

      {/* Next up ------------------------------------------------------- */}
      {next ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
                Next up · {next.routineName}
              </p>
              <p className="mt-1 truncate text-xl font-semibold">{next.dayName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {next.lastDoneLocalDate
                  ? `Last session ${relativeDays(next.lastDoneLocalDate)}`
                  : 'Nothing logged yet'}
              </p>
            </div>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-iron/15 text-iron">
              <BarbellIcon className="size-6" />
            </span>
          </div>
          <div className="flex gap-2 p-4">
            <Button
              variant="primary"
              className="flex-1 text-base"
              onClick={() => startWorkout(next.dayId)}
            >
              {active ? 'Resume session' : 'Start session'}
            </Button>
            <Button variant="outline" onClick={() => setPickingDay(true)}>
              <PlanIcon className="size-5" />
            </Button>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No routine yet"
          body="Build a routine and the next scheduled day shows up here."
          action={<Button variant="primary" onClick={() => navigate('/plans')}>Create a routine</Button>}
        />
      )}

      {/* Quick actions ------------------------------------------------- */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <QuickAction
          label="Log a run"
          tone="stride"
          icon={<ShoeIcon className="size-5" />}
          onClick={() => navigate('/run/new')}
        />
        <QuickAction
          label="Blank session"
          tone="iron"
          icon={<BarbellIcon className="size-5" />}
          onClick={() => startWorkout(undefined, 'Blank session')}
        />
        <QuickAction
          label="Body weight"
          tone="neutral"
          icon={<ScaleIcon className="size-5" />}
          onClick={() => navigate('/body')}
        />
      </div>

      {/* Fuel ----------------------------------------------------------- */}
      <FuelCard />

      {/* This week ----------------------------------------------------- */}
      <SectionTitle
        action={
          <span className="text-[11px] text-faint">
            from {formatDate(weekStart(todayLocalDate()))}
          </span>
        }
      >
        This week
      </SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Sessions" value={lifts?.sessions ?? 0} tone="iron" />
        <Stat label="Sets" value={lifts?.totalSets ?? 0} tone="iron" />
        <Stat label="Distance" value={fmtKm(runs?.distanceKm ?? 0)} unit="km" tone="stride" />
        <Stat
          label="Volume"
          value={fmtNumber(Math.round((lifts?.volumeKg ?? 0) / 1000), 1)}
          unit="t"
        />
      </div>

      {lastWeight?.weightKg ? (
        <button
          type="button"
          onClick={() => navigate('/body')}
          className="mt-2 flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-left active:bg-raised"
        >
          <ScaleIcon className="size-4 text-faint" />
          <span className="tabular text-sm">
            {fmtKg(lastWeight.weightKg)} <span className="text-xs text-muted">kg</span>
          </span>
          <span className="text-xs text-faint">
            weighed {relativeDays(lastWeight.localDate)}
            {daysBetween(lastWeight.localDate, todayLocalDate()) > 10 ? ' — due a check' : ''}
          </span>
          <ChevronRight className="ml-auto size-4 text-faint" />
        </button>
      ) : null}

      {/* Records ------------------------------------------------------- */}
      <RecordBoard />

      {/* Recent -------------------------------------------------------- */}
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="flex items-center gap-0.5 text-[11px] font-medium text-muted"
          >
            All history <ChevronRight className="size-3.5" />
          </button>
        }
      >
        Recent
      </SectionTitle>
      <Sheet open={pickingDay} onClose={() => setPickingDay(false)} title="Start another day">
        <div className="space-y-1.5">
          {(routineDays ?? []).map((day) => (
            <button
              key={day.id}
              type="button"
              onClick={() => {
                setPickingDay(false);
                startWorkout(day.id);
              }}
              className="flex w-full min-h-14 items-center gap-3 rounded-xl bg-raised px-3 text-left active:bg-line"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{day.name}</span>
              {day.id === next?.dayId ? <Chip tone="iron">Next up</Chip> : null}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full text-sm"
          onClick={() => navigate(`/plans/${next?.routineId}`)}
        >
          Edit this routine
        </Button>
      </Sheet>

      {recent && recent.length > 0 ? (
        <div className="space-y-2">
          {recent.map((entry) => (
            <HistoryRow key={`${entry.kind}-${entry.id}`} entry={entry} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing logged yet" body="Start a session or log a run to fill this in." />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------- fuel card

/**
 * Today's remaining energy, on the screen you already open. Hidden entirely
 * until a target exists: an empty ring is worse than no ring.
 */
function FuelCard() {
  const navigate = useNavigate();
  const today = todayLocalDate();
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const logs = useLiveQuery(() => getLogsForDate(today), [today], undefined);
  const weekLogs = useLiveQuery(() => getLogsForWeekOf(today), [today], undefined);
  const overrides = useLiveQuery(() => getDayOverridesForWeekOf(today), [today], undefined);

  if (!settings || !logs || !weekLogs || !overrides) return null;
  const target = settings.kcalTarget ?? 0;
  if (target <= 0) return null;

  const budget = buildWeekBudget(weekLogs, target, today, assumptionOf(settings, target, overrides));
  const allowance = dayAllowanceKcal(target, budget, settings.weeklyBudgetEnabled);
  const eaten = totalMacros(logs);
  const remaining = allowance - eaten.kcal;
  const over = remaining < 0;
  const pct = allowance > 0 ? Math.min(100, (eaten.kcal / allowance) * 100) : 0;

  return (
    <Card className="mt-3 p-4" onClick={() => navigate('/fuel')}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-fuel/15 text-fuel">
          <FlameIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
            {over ? 'Te pasaste por' : 'Te queda hoy'}
          </p>
          <p
            className={cx(
              'tabular mt-0.5 text-2xl leading-none font-semibold',
              over ? 'text-danger' : 'text-fuel',
            )}
          >
            {fmtKcal(Math.abs(remaining))}
            <span className="ml-1 text-xs font-medium text-muted">kcal</span>
          </p>
        </div>
        <span className="tabular shrink-0 text-right text-[11px] text-faint">
          P {fmtGrams(eaten.proteinG)}
          {settings.proteinTargetG ? `/${settings.proteinTargetG}` : ''} g
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={cx('h-full rounded-full', over ? 'bg-danger' : 'bg-fuel')}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- record board

const PR_TABS = [
  { value: 'weight' as const, label: 'Heaviest' },
  { value: 'e1rm' as const, label: 'Est. 1RM' },
  { value: 'volume' as const, label: 'Volume' },
];

const PR_HINT: Record<PrType, string> = {
  weight: 'Heaviest working set ever logged',
  e1rm: 'Best single-set Epley estimate',
  volume: 'Most working volume in one session',
};

/** Enough to see the board is there without pushing Recent off the screen. */
const COLLAPSED_RECORDS = 5;

function RecordBoard() {
  const navigate = useNavigate();
  const records = useLiveQuery(() => getPersonalRecords(), [], undefined);
  const [type, setType] = useState<PrType>('weight');
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(
    () => (records ?? []).filter((r) => r.prType === type),
    [records, type],
  );

  const total = records?.length ?? 0;

  return (
    <>
      <SectionTitle
        action={
          total > 0 ? (
            <span className="text-[11px] text-faint">
              {total} record{total === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      >
        Personal records
      </SectionTitle>

      {records && total === 0 ? (
        <EmptyState
          title="No records yet"
          body="Log a working set and the heaviest, the best estimated 1RM and the biggest session show up here."
        />
      ) : (
        <>
          <Segmented
            options={PR_TABS}
            value={type}
            onChange={(next) => {
              setType(next);
              setExpanded(false);
            }}
          />
          <p className="mt-2 mb-1.5 text-[11px] text-faint">{PR_HINT[type]}</p>

          <div className="space-y-1.5">
            {(expanded ? rows : rows.slice(0, COLLAPSED_RECORDS)).map((row) => (
              <RecordRow
                key={row.id}
                row={row}
                onOpen={() => navigate(`/exercises/${row.exercise.id}`)}
              />
            ))}
          </div>

          {rows.length > COLLAPSED_RECORDS ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 w-full py-2.5 text-center text-[11px] font-medium text-muted active:text-fg"
            >
              {expanded ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

function RecordRow({ row, onOpen }: { row: PersonalRecordRow; onOpen: () => void }) {
  const { set } = row;

  // A volume record belongs to a whole session, so there is no single load or
  // RPE to quote for it — it gets the session's name instead.
  const detail =
    row.prType === 'volume'
      ? row.workoutName || 'One session'
      : set
        ? `${loadLabelShort(set)} × ${set.reps}${set.rpe ? ` @ RPE ${set.rpe}` : ''}`
        : 'Set no longer logged';

  const headline =
    row.prType === 'volume'
      ? fmtNumber(Math.round(row.value))
      : row.prType === 'e1rm'
        ? `~${fmtNumber(row.value, 1)}`
        : fmtKg(row.value);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left active:bg-raised"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
        <TrophyIcon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.exercise.name}</span>
        <span className="tabular block truncate text-[11px] text-faint">
          {detail} · {relativeDays(row.localDate)}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tabular block text-sm font-semibold text-gold">
          {headline}
          <span className="ml-0.5 text-[10px] font-medium text-muted">kg</span>
        </span>
        <span className="tabular block text-[10px] text-faint">
          {formatDateShort(row.localDate)}
        </span>
      </span>
    </button>
  );
}

function QuickAction({
  label,
  icon,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: 'iron' | 'stride' | 'neutral';
}) {
  const toneClass =
    tone === 'iron' ? 'text-iron' : tone === 'stride' ? 'text-stride' : 'text-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line-soft bg-surface px-2 py-3 active:bg-raised"
    >
      <span className={toneClass}>{icon}</span>
      <span className="text-center text-[11px] leading-tight font-medium text-muted">{label}</span>
    </button>
  );
}
