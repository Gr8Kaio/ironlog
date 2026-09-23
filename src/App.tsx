import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { seedIfEmpty } from './db/seed';
import { seedFoodsIfMissing } from './db/seedFoods';
import { backfillBodyweightSets, migrateExerciseLibrary } from './db/backfill';
import { getActiveWorkout } from './db/queries';
import { ChartIcon, FlameIcon, GearIcon, HistoryIcon, HomeIcon, PlanIcon } from './components/icons';
import { cx } from './components/ui';
import { Home } from './screens/Home';
import { ExerciseLibrary } from './screens/ExerciseLibrary';
import { Routines } from './screens/Routines';
import { RoutineEditor } from './screens/RoutineEditor';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { RunEditor } from './screens/RunEditor';
import { History } from './screens/History';
import { SessionDetail } from './screens/SessionDetail';
import { Progress } from './screens/Progress';
import { ExerciseDetail } from './screens/ExerciseDetail';
import { BodyMetrics } from './screens/BodyMetrics';
import { SettingsScreen } from './screens/Settings';
import { FoodLibrary } from './screens/FoodLibrary';
import { FuelToday } from './screens/FuelToday';
import { FuelWeek } from './screens/FuelWeek';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/fuel', label: 'Fuel', Icon: FlameIcon },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/progress', label: 'Progress', Icon: ChartIcon },
  { to: '/plans', label: 'Plans', Icon: PlanIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
];

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // First run on a fresh device: fill the library and the demo history so
    // there is something to look at before anything real is logged.
    seedIfEmpty()
      .then(() => migrateExerciseLibrary())
      .then(() => backfillBodyweightSets())
      .then(() => seedFoodsIfMissing())
      .catch((err) => console.error('startup failed', err))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <div className="animate-pop text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/exercises/:exerciseId" element={<ExerciseDetail />} />
        <Route path="/plans" element={<Routines />} />
        <Route path="/plans/:routineId" element={<RoutineEditor />} />
        <Route path="/workout/:workoutId" element={<ActiveWorkout />} />
        <Route path="/run/new" element={<RunEditor />} />
        <Route path="/run/:runId" element={<RunEditor />} />
        <Route path="/history" element={<History />} />
        <Route path="/session/:workoutId" element={<SessionDetail />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/body" element={<BodyMetrics />} />
        <Route path="/fuel" element={<FuelToday />} />
        <Route path="/fuel/foods" element={<FoodLibrary />} />
        <Route path="/fuel/week" element={<FuelWeek />} />
        <Route path="/fuel/day/:localDate" element={<FuelToday />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
      <BottomDock />
    </div>
  );
}

/**
 * A session left open is the easiest way to lose a workout, so it follows you
 * across every screen until it is finished or discarded.
 *
 * It docks above the tab bar rather than at the top of the screen: pinned to
 * the top it covered each screen's own header actions, and down here it is
 * also within thumb reach.
 */
function ActiveWorkoutRow() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => getActiveWorkout(), [], null);

  if (!active) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/workout/${active.id}`)}
      className="flex w-full items-center gap-3 border-b border-iron/30 bg-iron/15 px-4 py-2.5 text-left active:bg-iron/25"
    >
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-iron opacity-70" />
        <span className="relative inline-flex size-2.5 rounded-full bg-iron" />
      </span>
      <span className="flex-1 truncate text-left text-sm font-medium text-iron">
        {active.name} in progress
      </span>
      <span className="text-xs font-semibold text-iron">Resume</span>
    </button>
  );
}

function BottomDock() {
  const location = useLocation();
  // The logger owns the screen: its own rest bar sits where the dock would.
  if (location.pathname.startsWith('/workout/')) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line-soft bg-ink/95 pb-safe backdrop-blur-lg">
      <ActiveWorkoutRow />
      <div className="flex">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2',
                isActive ? 'text-iron' : 'text-faint active:text-muted',
              )
            }
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
