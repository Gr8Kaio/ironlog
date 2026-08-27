import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { Routine } from '../db/types';
import { Button, Card, Chip, EmptyState, Screen, SectionTitle, TopBar } from '../components/ui';
import { ChevronRight, PlusIcon } from '../components/icons';

export function Routines() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const routines = useLiveQuery(() => db.routines.toArray(), [], undefined);
  const dayCounts = useLiveQuery(async () => {
    const days = await db.routineDays.toArray();
    const counts = new Map<string, number>();
    for (const day of days) counts.set(day.routineId, (counts.get(day.routineId) ?? 0) + 1);
    return counts;
  }, [], undefined);

  async function create() {
    setCreating(true);
    const now = Date.now();
    const routine: Routine = {
      id: newId(),
      name: 'New routine',
      // Only one routine drives the next-day hint, so a new one takes over
      // only when it is the first.
      isActive: (routines?.length ?? 0) === 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.routines.add(routine);
    setCreating(false);
    navigate(`/plans/${routine.id}`);
  }

  async function setActive(routineId: string) {
    const all = await db.routines.toArray();
    await db.routines.bulkPut(all.map((r) => ({ ...r, isActive: r.id === routineId })));
  }

  return (
    <Screen>
      <TopBar title="Plans" subtitle="Routines and the exercise library" />

      <SectionTitle>Routines</SectionTitle>
      {routines && routines.length > 0 ? (
        <div className="space-y-2">
          {routines.map((routine) => (
            <Card key={routine.id} className="p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/plans/${routine.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{routine.name}</span>
                    {routine.isActive ? <Chip tone="iron">Active</Chip> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">
                    {dayCounts?.get(routine.id) ?? 0} days
                    {routine.notes ? ` · ${routine.notes}` : ''}
                  </span>
                </button>
                <ChevronRight className="size-4 shrink-0 text-faint" />
              </div>
              {!routine.isActive ? (
                <button
                  type="button"
                  onClick={() => setActive(routine.id)}
                  className="mt-2 w-full rounded-lg bg-raised py-2 text-xs font-medium text-muted active:bg-line"
                >
                  Make active
                </button>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No routines yet" body="A routine drives the next scheduled day on the home screen." />
      )}

      <Button variant="outline" className="mt-3 w-full" onClick={create} disabled={creating}>
        <PlusIcon className="size-5" /> New routine
      </Button>

      <SectionTitle>Library</SectionTitle>
      <Card onClick={() => navigate('/exercises')} className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Exercises</span>
          <span className="block text-xs text-faint">Add, edit and archive exercises</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Card>

      <Card onClick={() => navigate('/body')} className="mt-2 flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Body metrics</span>
          <span className="block text-xs text-faint">Weight and measurements over time</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Card>
    </Screen>
  );
}
