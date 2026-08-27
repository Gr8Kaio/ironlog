import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import {
  getActiveWorkout,
  getHistory,
  getNextScheduledDay,
  getWeeklyLiftStats,
  getWeeklyRunStats,
} from '../db/queries';
import type { Workout } from '../db/types';
import { fmtKg, fmtKm, fmtNumber } from '../lib/calc';
import { daysBetween, formatDate, localDateOf, relativeDays, todayLocalDate, weekStart } from '../lib/dates';
import { HistoryRow } from '../components/HistoryRow';
import { BarbellIcon, ChevronRight, PlanIcon, ScaleIcon, ShoeIcon } from '../components/icons';
import { Button, Card, EmptyState, Screen, SectionTitle, Stat, TopBar } from '../components/ui';

export function Home() {
  const navigate = useNavigate();

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
            <Button variant="outline" onClick={() => navigate(`/plans/${next.routineId}`)}>
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
