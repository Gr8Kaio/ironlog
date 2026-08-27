import { Screen, TopBar, EmptyState } from '../components/ui';

export function SettingsScreen() {
  return (
    <Screen>
      <TopBar title="Settings" />
      <EmptyState title="Coming next" />
    </Screen>
  );
}
