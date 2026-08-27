import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../db/db';
import {
  getExerciseMap,
  getPaceTrend,
  getRunTotals,
  getWeeklyLiftStats,
  getWeeklyRunStats,
} from '../db/queries';
import { RUN_TYPES } from '../db/types';
import type { RunType } from '../db/types';
import { fmtKm, fmtNumber, formatPace } from '../lib/calc';
import { formatDateShort, formatMonth, relativeDays } from '../lib/dates';
import { MUSCLE_LABEL, RUN_TYPE_LABEL } from '../lib/labels';
import {
  AXIS_PROPS,
  CHART,
  ChartFrame,
  Legend,
  RUN_TYPE_COLOR,
  TooltipBox,
} from '../components/charts';
import { ChevronRight } from '../components/icons';
import { Card, EmptyState, Screen, SectionTitle, Segmented, Stat, TopBar } from '../components/ui';

const TABS = [
  { value: 'lifts' as const, label: 'Lifts' },
  { value: 'running' as const, label: 'Running' },
];

export function Progress() {
  const [tab, setTab] = useState<'lifts' | 'running'>('lifts');

  return (
    <Screen>
      <TopBar title="Progress" />
      <Segmented options={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">{tab === 'lifts' ? <LiftProgress /> : <RunProgress />}</div>
    </Screen>
  );
}

// -------------------------------------------------------------------- lifts

function LiftProgress() {
  const navigate = useNavigate();
  const weeks = useLiveQuery(() => getWeeklyLiftStats(8), [], undefined);
  const exercises = useLiveQuery(() => getExerciseMap(), [], undefined);
  const recentSets = useLiveQuery(
    () => db.sets.orderBy('completedAt').reverse().limit(400).toArray(),
    [],
    undefined,
  );

  const weekData = useMemo(
    () =>
      (weeks ?? []).map((w) => ({
        week: w.week,
        label: formatDateShort(w.week),
        sets: w.totalSets,
        sessions: w.sessions,
        volume: Math.round(w.volumeKg),
      })),
    [weeks],
  );

  const thisWeek = weeks?.at(-1);

  const muscleRows = useMemo(() => {
    if (!thisWeek) return [];
    return Object.entries(thisWeek.setsByMuscle)
      .map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets);
  }, [thisWeek]);

  const maxMuscleSets = Math.max(1, ...muscleRows.map((r) => r.sets));

  // Most recently trained first: the exercise you want to look at is usually
  // the one you just did.
  const exerciseRows = useMemo(() => {
    if (!recentSets || !exercises) return [];
    const seen = new Map<string, number>();
    for (const set of recentSets) {
      if (!seen.has(set.exerciseId)) seen.set(set.exerciseId, set.completedAt);
    }
    return [...seen.entries()]
      .map(([id, at]) => ({ exercise: exercises.get(id), at }))
      .filter((row) => row.exercise)
      .slice(0, 30);
  }, [recentSets, exercises]);

  const hasData = weekData.some((w) => w.sets > 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={thisWeek?.sessions ?? 0} tone="iron" />
        <Stat label="Working sets" value={thisWeek?.totalSets ?? 0} tone="iron" />
        <Stat
          label="Volume"
          value={fmtNumber(Math.round((thisWeek?.volumeKg ?? 0) / 1000), 1)}
          unit="t"
        />
      </div>

      <div className="mt-3 space-y-3">
        {/*
          Sets and sessions are different scales, so they get separate charts
          rather than a second y-axis.
        */}
        <ChartFrame title="Working sets per week" hint="Last 8 weeks" empty={!hasData}>
          <BarChart data={weekData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={40} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: '#ffffff08' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={`Week of ${label}`}
                    rows={[
                      { key: 'sets', color: CHART.iron, name: 'Working sets', value: payload[0].value as number },
                      {
                        key: 'sessions',
                        name: 'Sessions',
                        value: payload[0].payload.sessions as number,
                      },
                      {
                        key: 'volume',
                        name: 'Volume',
                        value: `${fmtNumber(payload[0].payload.volume as number)} kg`,
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="sets" fill={CHART.iron} radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ChartFrame>

        <Card className="p-3">
          <h3 className="text-sm font-medium">Sets by muscle group</h3>
          <p className="mb-3 text-[11px] text-faint">This week · working sets only</p>
          {muscleRows.length === 0 ? (
            <p className="py-4 text-center text-xs text-faint">Nothing logged this week yet</p>
          ) : (
            <div className="space-y-1.5">
              {muscleRows.map((row) => (
                <div key={row.muscle} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] text-muted">
                    {MUSCLE_LABEL[row.muscle as keyof typeof MUSCLE_LABEL] ?? row.muscle}
                  </span>
                  <span className="h-4 flex-1 overflow-hidden rounded-sm bg-raised">
                    <span
                      className="block h-full rounded-sm bg-iron"
                      style={{ width: `${(row.sets / maxMuscleSets) * 100}%` }}
                    />
                  </span>
                  <span className="tabular w-6 shrink-0 text-right text-[11px] font-semibold">
                    {row.sets}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <SectionTitle>Per exercise</SectionTitle>
      {exerciseRows.length === 0 ? (
        <EmptyState title="No exercises logged yet" />
      ) : (
        <div className="space-y-1.5">
          {exerciseRows.map(({ exercise, at }) => (
            <button
              key={exercise!.id}
              type="button"
              onClick={() => navigate(`/exercises/${exercise!.id}`)}
              className="flex w-full min-h-14 items-center gap-3 rounded-xl bg-surface px-3 text-left active:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{exercise!.name}</span>
                <span className="block text-[11px] text-faint">
                  {MUSCLE_LABEL[exercise!.muscleGroup]} · last {relativeDays(
                    new Date(at).toISOString().slice(0, 10),
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ running

function RunProgress() {
  const weeks = useLiveQuery(() => getWeeklyRunStats(8), [], undefined);
  const trend = useLiveQuery(() => getPaceTrend(), [], undefined);
  const totals = useLiveQuery(() => getRunTotals(), [], undefined);

  const [visible, setVisible] = useState<Set<RunType>>(new Set(RUN_TYPES));

  const weekData = useMemo(
    () =>
      (weeks ?? []).map((w) => ({
        label: formatDateShort(w.week),
        km: Math.round(w.distanceKm * 10) / 10,
        runs: w.runs,
      })),
    [weeks],
  );

  /**
   * One line per run type on a shared date axis. Easy and tempo runs describe
   * different efforts, so averaging them into a single pace line would
   * describe neither.
   */
  const paceData = useMemo(() => {
    if (!trend) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const point of trend) {
      if (!visible.has(point.runType)) continue;
      const row = byDate.get(point.localDate) ?? { date: point.localDate };
      row[point.runType] = Math.round(point.paceSecPerKm);
      byDate.set(point.localDate, row);
    }
    return [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [trend, visible]);

  const typesPresent = useMemo(() => {
    const present = new Set((trend ?? []).map((p) => p.runType));
    return RUN_TYPES.filter((t) => present.has(t));
  }, [trend]);

  const thisWeek = weeks?.at(-1);
  const currentMonth = totals?.byMonth.at(-1);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="This week" value={fmtKm(thisWeek?.distanceKm ?? 0)} unit="km" tone="stride" />
        <Stat
          label="Longest"
          value={fmtKm(totals?.longestKm ?? 0)}
          unit="km"
          tone="stride"
        />
        <Stat
          label={currentMonth ? formatMonth(currentMonth.month) : 'This month'}
          value={fmtKm(currentMonth?.distanceKm ?? 0)}
          unit="km"
        />
      </div>

      <div className="mt-3 space-y-3">
        <ChartFrame
          title="Distance per week"
          hint="Last 8 weeks"
          empty={!weekData.some((w) => w.km > 0)}
        >
          <BarChart data={weekData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={40} />
            <Tooltip
              cursor={{ fill: '#ffffff08' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={`Week of ${label}`}
                    rows={[
                      {
                        key: 'km',
                        color: CHART.stride,
                        name: 'Distance',
                        value: `${payload[0].value} km`,
                      },
                      { key: 'runs', name: 'Runs', value: payload[0].payload.runs as number },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="km" fill={CHART.stride} radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ChartFrame>

        <div className="rounded-2xl border border-line-soft bg-surface p-3">
          <ChartFrame
            title="Pace trend"
            hint="Lower is faster · one line per run type"
            empty={paceData.length < 2}
          >
            <LineChart data={paceData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="date"
                {...AXIS_PROPS}
                tickFormatter={(value: string) => formatDateShort(value)}
                interval="preserveStartEnd"
              />
              <YAxis
                {...AXIS_PROPS}
                width={48}
                domain={['dataMin - 20', 'dataMax + 20']}
                tickFormatter={(value: number) => formatPace(value).replace('/km', '')}
              />
              <Tooltip
                cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      label={formatDateShort(String(label))}
                      rows={payload.map((item) => ({
                        key: String(item.dataKey),
                        color: item.color,
                        name: RUN_TYPE_LABEL[item.dataKey as RunType],
                        value: formatPace(item.value as number),
                      }))}
                    />
                  ) : null
                }
              />
              {typesPresent
                .filter((type) => visible.has(type))
                .map((type) => (
                  <Line
                    key={type}
                    type="monotone"
                    dataKey={type}
                    stroke={RUN_TYPE_COLOR[type]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: RUN_TYPE_COLOR[type] }}
                    activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
            </LineChart>
          </ChartFrame>

          {typesPresent.length > 0 ? (
            <Legend
              items={typesPresent.map((type) => ({
                key: type,
                label: RUN_TYPE_LABEL[type],
                color: RUN_TYPE_COLOR[type],
              }))}
              active={visible as Set<string>}
              onToggle={(key) =>
                setVisible((prev) => {
                  const next = new Set(prev);
                  if (next.has(key as RunType)) next.delete(key as RunType);
                  else next.add(key as RunType);
                  return next;
                })
              }
            />
          ) : null}
        </div>
      </div>

      <SectionTitle>Monthly totals</SectionTitle>
      {totals && totals.byMonth.length > 0 ? (
        <Card className="divide-y divide-line-soft">
          {[...totals.byMonth].reverse().map((month) => (
            <div key={month.month} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">{formatMonth(month.month)}</span>
              <span className="text-[11px] text-faint">
                {month.runs} run{month.runs === 1 ? '' : 's'}
              </span>
              <span className="tabular w-16 text-right text-sm font-semibold text-stride">
                {fmtKm(month.distanceKm)} km
              </span>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title="No runs logged yet" />
      )}

      {totals?.longestDate ? (
        <p className="mt-3 text-center text-[11px] text-faint">
          Longest run: {fmtKm(totals.longestKm)} km on {formatDateShort(totals.longestDate)}
        </p>
      ) : null}
    </>
  );
}
