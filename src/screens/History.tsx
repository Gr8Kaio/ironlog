import { Screen, TopBar, EmptyState } from '../components/ui';

export function History() {
  return (
    <Screen>
      <TopBar title="History" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
