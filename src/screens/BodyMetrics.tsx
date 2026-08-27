import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { db, newId } from '../db/db';
import type { BodyMetric } from '../db/types';
import { fmtKg } from '../lib/calc';
import { formatDate, formatDateShort, localDateOf, toEpoch, todayLocalDate } from '../lib/dates';
import { AXIS_PROPS, CHART, ChartFrame, TooltipBox } from '../components/charts';
import { Stepper } from '../components/Stepper';
import {
  Button,
  ConfirmRow,
  Field,
  Screen,
  Sheet,
  TextInput,
  TopBar,
} from '../components/ui';
import { ChevronLeft, PlusIcon } from '../components/icons';

/** Optional tape measurements, kept out of the way until asked for. */
const MEASUREMENTS = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
  { key: 'hipCm', label: 'Hip' },
] as const;

export function BodyMetrics() {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BodyMetric | null>(null);

  const metrics = useLiveQuery(
    () => db.bodyMetrics.orderBy('measuredAt').toArray(),
    [],
    undefined,
  );

  const weightSeries = useMemo(
    () =>
      (metrics ?? [])
        .filter((m) => m.weightKg != null)
        .map((m) => ({ date: m.localDate, weight: m.weightKg as number })),
    [metrics],
  );

  const latest = [...(metrics ?? [])].reverse().find((m) => m.weightKg != null);
  const previous = [...(metrics ?? [])]
    .reverse()
    .filter((m) => m.weightKg != null)
    .at(1);
  const delta =
    latest?.weightKg != null && previous?.weightKg != null
      ? Math.round((latest.weightKg - previous.weightKg) * 10) / 10
      : null;

  return (
    <Screen>
      <TopBar
        title="Body"
        subtitle={latest ? `${fmtKg(latest.weightKg!)} kg · ${formatDate(latest.localDate)}` : undefined}
        left={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        right={
          <Button variant="primary" className="min-h-10 px-3 text-sm" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" /> Log
          </Button>
        }
      />

      <ChartFrame
        title="Body weight"
        hint={
          delta !== null
            ? `${delta > 0 ? '+' : ''}${delta} kg since the previous entry`
            : 'Every logged weight'
        }
        empty={weightSeries.length < 2}
      >
        <AreaChart data={weightSeries} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="fadeWeight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.stride} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART.stride} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="date"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatDateShort(value)}
            interval="preserveStartEnd"
          />
          <YAxis {...AXIS_PROPS} width={44} domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip
            cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={formatDate(String(label))}
                  rows={[
                    {
                      key: 'weight',
                      color: CHART.stride,
                      name: 'Weight',
                      value: `${fmtKg(payload[0].value as number)} kg`,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke={CHART.stride}
            strokeWidth={2}
            fill="url(#fadeWeight)"
            dot={{ r: 3, strokeWidth: 0, fill: CHART.stride }}
            activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ChartFrame>

      <div className="mt-4 space-y-1.5">
        {[...(metrics ?? [])].reverse().map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() => setEditing(metric)}
            className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left active:bg-raised"
          >
            <span className="flex-1 text-sm">{formatDate(metric.localDate)}</span>
            <span className="text-[11px] text-faint">
              {MEASUREMENTS.filter((m) => metric[m.key] != null)
                .map((m) => `${m.label} ${metric[m.key]}`)
                .join(' · ')}
            </span>
            <span className="tabular w-16 text-right text-sm font-semibold">
              {metric.weightKg != null ? `${fmtKg(metric.weightKg)} kg` : '--'}
            </span>
          </button>
        ))}
        {metrics && metrics.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">Nothing logged yet.</p>
        ) : null}
      </div>

      {adding || editing ? (
        <MetricSheet
          metric={editing}
          fallbackWeight={latest?.weightKg ?? 75}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function MetricSheet({
  metric,
  fallbackWeight,
  onClose,
}: {
  metric: BodyMetric | null;
  fallbackWeight: number;
  onClose: () => void;
}) {
  const [localDate, setLocalDate] = useState(metric?.localDate ?? todayLocalDate());
  const [weight, setWeight] = useState(metric?.weightKg ?? fallbackWeight);
  const [tape, setTape] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MEASUREMENTS.map((m) => [m.key, metric?.[m.key] != null ? String(metric[m.key]) : '']),
    ),
  );
  const [notes, setNotes] = useState(metric?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const measuredAt = metric?.measuredAt ?? toEpoch(localDate, '07:30');
    const record: BodyMetric = {
      id: metric?.id ?? newId(),
      measuredAt: metric ? toEpoch(localDate, '07:30') : measuredAt,
      localDate,
      weightKg: weight,
      notes: notes.trim() || undefined,
      ...Object.fromEntries(
        MEASUREMENTS.map((m) => [m.key, tape[m.key] === '' ? null : Number(tape[m.key])]),
      ),
    };
    await db.bodyMetrics.put(record);
    onClose();
  }

  async function remove() {
    if (metric) await db.bodyMetrics.delete(metric.id);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={metric ? 'Edit entry' : 'Log body weight'}>
      <div className="space-y-3">
        <Stepper
          label="Weight"
          value={weight}
          onChange={setWeight}
          step={0.1}
          min={20}
          max={300}
          format={fmtKg}
          suffix="kg"
          tone="stride"
          size="lg"
        />

        <Field label="Date">
          <TextInput
            type="date"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value || localDateOf(Date.now()))}
          />
        </Field>

        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            Measurements (cm, optional)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MEASUREMENTS.map((m) => (
              <label key={m.key} className="flex items-center gap-2 rounded-xl bg-raised px-3">
                <span className="w-12 shrink-0 text-xs text-muted">{m.label}</span>
                <input
                  value={tape[m.key]}
                  onChange={(e) => setTape((prev) => ({ ...prev, [m.key]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="--"
                  className="tabular h-12 w-full min-w-0 bg-transparent text-right outline-none"
                />
              </label>
            ))}
          </div>
        </div>

        <Field label="Notes">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Button variant="primary" className="w-full" onClick={save}>
          Save
        </Button>

        {metric ? (
          confirmDelete ? (
            <ConfirmRow
              message="Delete this entry?"
              confirmLabel="Delete"
              onConfirm={remove}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 text-center text-sm text-faint active:text-danger"
            >
              Delete entry
            </button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}
