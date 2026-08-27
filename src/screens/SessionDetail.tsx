import { Screen, TopBar, EmptyState } from '../components/ui';

export function SessionDetail() {
  return (
    <Screen>
      <TopBar title="Session" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
