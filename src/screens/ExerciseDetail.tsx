import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../db/db';
import { getExerciseProgress } from '../db/queries';
import type { PrType } from '../db/types';
import { PR_LABEL } from '../lib/prs';
import { E1RM_REP_CAP, fmtKg, fmtNumber } from '../lib/calc';
import { formatDate, formatDateShort, localDateOf } from '../lib/dates';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../lib/labels';
import { AXIS_PROPS, CHART, ChartFrame, TooltipBox } from '../components/charts';
import { ChevronLeft, TrophyIcon } from '../components/icons';
import { Card, Screen, SectionTitle, Segmented, Stat, TopBar } from '../components/ui';

const METRICS = [
  { value: 'e1rm' as const, label: 'Est. 1RM' },
  { value: 'top' as const, label: 'Top set' },
  { value: 'volume' as const, label: 'Volume' },
];

type Metric = (typeof METRICS)[number]['value'];

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const navigate = useNavigate();
  const [metric, setMetric] = useState<Metric>('e1rm');

  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId], undefined);
  const points = useLiveQuery(() => getExerciseProgress(exerciseId), [exerciseId], undefined);
  const records = useLiveQuery(
    () => db.personalRecords.where('exerciseId').equals(exerciseId).toArray(),
    [exerciseId],
    undefined,
  );

  const data = useMemo(
    () =>
      (points ?? [])
        .map((p) => ({
          date: p.localDate,
          e1rm: p.e1rm === null ? null : Math.round(p.e1rm * 10) / 10,
          top: p.topWeightKg,
          reps: p.topReps,
          volume: Math.round(p.volumeKg),
        }))
        // A session of only high-rep sets has no honest 1RM estimate, so it is
        // absent from that series rather than plotted as zero.
        .filter((row) => (metric === 'e1rm' ? row.e1rm !== null : true)),
    [points, metric],
  );

  if (!exercise) {
    return (
      <Screen>
        <TopBar title="Exercise" />
      </Screen>
    );
  }

  const unit = metric === 'volume' ? 'kg total' : 'kg';
  const byType = new Map((records ?? []).map((r) => [r.prType, r]));

  return (
    <Screen>
      <TopBar
        title={exercise.name}
        subtitle={`${MUSCLE_LABEL[exercise.muscleGroup]} · ${EQUIPMENT_LABEL[exercise.equipment]}`}
        left={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        {(['weight', 'e1rm', 'volume'] as PrType[]).map((type) => (
          <Stat
            key={type}
            label={PR_LABEL[type].replace(' PR', '')}
            value={byType.has(type) ? fmtNumber(byType.get(type)!.value, type === 'volume' ? 0 : 1) : '--'}
            unit="kg"
            tone="gold"
          />
        ))}
      </div>

      {records && records.length > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          <TrophyIcon className="size-3.5 text-gold" />
          Best e1RM on{' '}
          {byType.has('e1rm') ? formatDate(localDateOf(byType.get('e1rm')!.achievedAt)) : '--'}
        </p>
      ) : null}

      <SectionTitle>Trend</SectionTitle>
      <Segmented options={METRICS} value={metric} onChange={setMetric} />

      <div className="mt-2">
        <ChartFrame
          title={METRICS.find((m) => m.value === metric)!.label}
          hint={
            metric === 'e1rm'
              ? `Epley, sets of ${E1RM_REP_CAP} reps or fewer`
              : metric === 'top'
                ? 'Heaviest working set per session'
                : 'Working volume per session'
          }
          empty={data.length < 2}
        >
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fadeIron" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.iron} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART.iron} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="date"
              {...AXIS_PROPS}
              tickFormatter={(value: string) => formatDateShort(value)}
              interval="preserveStartEnd"
            />
            <YAxis {...AXIS_PROPS} width={44} domain={['dataMin - 5', 'dataMax + 5']} />
            <Tooltip
              cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={formatDate(String(label))}
                    rows={[
                      {
                        key: metric,
                        color: CHART.iron,
                        name: METRICS.find((m) => m.value === metric)!.label,
                        value: `${fmtNumber(payload[0].value as number, metric === 'volume' ? 0 : 1)} ${unit}`,
                      },
                      ...(metric === 'top'
                        ? [
                            {
                              key: 'reps',
                              name: 'Reps',
                              value: payload[0].payload.reps as number,
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={CHART.iron}
              strokeWidth={2}
              fill="url(#fadeIron)"
              dot={{ r: 3, strokeWidth: 0, fill: CHART.iron }}
              activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
              connectNulls
            />
          </AreaChart>
        </ChartFrame>
      </div>

      <SectionTitle>Sessions</SectionTitle>
      {points && points.length > 0 ? (
        <Card className="divide-y divide-line-soft">
          {[...points].reverse().map((point) => (
            <div key={point.localDate} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">{formatDate(point.localDate)}</span>
              <span className="tabular text-[11px] text-faint">
                {fmtNumber(point.volumeKg)} kg
              </span>
              <span className="tabular w-20 text-right text-sm">
                <span className="font-semibold">{fmtKg(point.topWeightKg)}</span>
                <span className="text-xs text-muted"> × {point.topReps}</span>
              </span>
            </div>
          ))}
        </Card>
      ) : (
        <p className="py-6 text-center text-sm text-faint">Nothing logged for this exercise yet.</p>
      )}
    </Screen>
  );
}
