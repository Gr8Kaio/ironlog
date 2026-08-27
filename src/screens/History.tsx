import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getHistory } from '../db/queries';
import type { HistoryEntry } from '../db/queries';
import { fmtKm, fmtNumber } from '../lib/calc';
import { formatDate, weekStart } from '../lib/dates';
import { HistoryRow } from '../components/HistoryRow';
import { EmptyState, Screen, Segmented, TopBar } from '../components/ui';

type Filter = 'all' | 'lifts' | 'runs';

const FILTERS = [
  { value: 'all' as const, label: 'Everything' },
  { value: 'lifts' as const, label: 'Lifts' },
  { value: 'runs' as const, label: 'Runs' },
];

export function History() {
  const [filter, setFilter] = useState<Filter>('all');
  const entries = useLiveQuery(() => getHistory(200), [], undefined);

  const weeks = useMemo(() => {
    if (!entries) return [];
    const kept = entries.filter((e) =>
      filter === 'all' ? true : filter === 'runs' ? e.kind === 'run' : e.kind === 'workout',
    );

    const byWeek = new Map<string, HistoryEntry[]>();
    for (const entry of kept) {
      const key = weekStart(entry.localDate);
      const list = byWeek.get(key) ?? [];
      list.push(entry);
      byWeek.set(key, list);
    }
    return [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, filter]);

  return (
    <Screen>
      <TopBar title="History" subtitle="Lifts and runs, one timeline" />

      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      {entries && entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing logged yet" body="Sessions and runs appear here together." />
        </div>
      ) : null}

      <div className="mt-4 space-y-6">
        {weeks.map(([week, items]) => (
          <section key={week}>
            <WeekHeader week={week} items={items} />
            <div className="space-y-2">
              {items.map((entry) => (
                <HistoryRow key={`${entry.kind}-${entry.id}`} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Screen>
  );
}

/**
 * A per-week summary sits above each group, since the reason lifts and runs
 * share a list at all is to see how the week actually balanced out.
 */
function WeekHeader({ week, items }: { week: string; items: HistoryEntry[] }) {
  const lifts = items.filter((e) => e.kind === 'workout');
  const runs = items.filter((e) => e.kind === 'run');
  const km = runs.reduce((t, r) => t + (r.kind === 'run' ? r.run.distanceKm : 0), 0);
  const sets = lifts.reduce((t, w) => t + (w.kind === 'workout' ? w.workingSets : 0), 0);

  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-widest text-faint uppercase">
        Week of {formatDate(week)}
      </h2>
      <span className="tabular text-[11px] text-faint">
        {lifts.length > 0 ? (
          <span className="text-iron">
            {lifts.length} session{lifts.length === 1 ? '' : 's'} · {fmtNumber(sets)} sets
          </span>
        ) : null}
        {lifts.length > 0 && runs.length > 0 ? ' · ' : ''}
        {runs.length > 0 ? <span className="text-stride">{fmtKm(km)} km</span> : null}
      </span>
    </div>
  );
}
