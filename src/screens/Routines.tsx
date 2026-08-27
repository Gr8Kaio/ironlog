import { Screen, TopBar, EmptyState } from '../components/ui';

export function Routines() {
  return (
    <Screen>
      <TopBar title="Plans" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
