import { Screen, TopBar, EmptyState } from '../components/ui';

export function RoutineEditor() {
  return (
    <Screen>
      <TopBar title="Routine" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
