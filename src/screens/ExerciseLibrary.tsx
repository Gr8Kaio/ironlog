import { Screen, TopBar, EmptyState } from '../components/ui';

export function ExerciseLibrary() {
  return (
    <Screen>
      <TopBar title="Library" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
