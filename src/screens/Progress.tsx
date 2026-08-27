import { Screen, TopBar, EmptyState } from '../components/ui';

export function Progress() {
  return (
    <Screen>
      <TopBar title="Progress" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
