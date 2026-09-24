import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { db, newId } from '../db/db';
import type { BodyMetric, BodyPhoto } from '../db/types';
import { fmtKg } from '../lib/calc';
import { formatDate, formatDateShort, localDateOf, toEpoch, todayLocalDate } from '../lib/dates';
import { AXIS_PROPS, CHART, ChartFrame, TooltipBox } from '../components/charts';
import { Stepper } from '../components/Stepper';
import { AddPhotoButton, PhotoThumb, PhotoViewer, useBlobUrl } from '../components/BodyPhotos';
import { addPhoto } from '../lib/photos';
import {
  Button,
  ConfirmRow,
  Field,
  Screen,
  Sheet,
  TextInput,
  TopBar,
} from '../components/ui';
import { CameraIcon, ChevronLeft, PlusIcon } from '../components/icons';

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
  const [viewing, setViewing] = useState<string | null>(null);

  const metrics = useLiveQuery(
    () => db.bodyMetrics.orderBy('measuredAt').toArray(),
    [],
    undefined,
  );

  // Oldest first, which is the order the viewer steps through and the one
  // "Compare" measures against.
  const photos = useLiveQuery(
    async () =>
      (await db.bodyPhotos.toArray()).sort(
        (a, b) => a.localDate.localeCompare(b.localDate) || a.takenAt - b.takenAt,
      ),
    [],
    [] as BodyPhoto[],
  );
  const photoCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) counts.set(p.bodyMetricId, (counts.get(p.bodyMetricId) ?? 0) + 1);
    return counts;
  }, [photos]);
  const metricsById = useMemo(() => new Map((metrics ?? []).map((m) => [m.id, m])), [metrics]);

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

      {photos.length > 0 ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Photos</span>
            <span className="text-[11px] text-faint">{photos.length}</span>
          </div>
          {/* Newest first here: the strip is for "how do I look lately". */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {[...photos].reverse().map((photo) => (
              <PhotoThumb
                key={photo.id}
                blob={photo.blob}
                onClick={() => setViewing(photo.id)}
                className="aspect-[3/4] w-24 shrink-0"
              >
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] font-medium text-white">
                  {formatDateShort(photo.localDate)}
                </span>
              </PhotoThumb>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-1.5">
        {[...(metrics ?? [])].reverse().map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() => setEditing(metric)}
            className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left active:bg-raised"
          >
            <span className="flex flex-1 items-center gap-1.5 text-sm">
              {formatDate(metric.localDate)}
              {photoCount.get(metric.id) ? (
                <span className="flex items-center gap-0.5 text-[11px] text-faint">
                  <CameraIcon className="size-3.5" />
                  {photoCount.get(metric.id)! > 1 ? photoCount.get(metric.id) : null}
                </span>
              ) : null}
            </span>
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
          photos={editing ? photos.filter((p) => p.bodyMetricId === editing.id) : []}
          onViewPhoto={setViewing}
          fallbackWeight={latest?.weightKg ?? 75}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}

      {/* After the sheet, so it opens on top of it when a thumbnail there is tapped. */}
      {viewing ? (
        <PhotoViewer
          photos={photos}
          startId={viewing}
          metricsById={metricsById}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </Screen>
  );
}

function MetricSheet({
  metric,
  photos,
  onViewPhoto,
  fallbackWeight,
  onClose,
}: {
  metric: BodyMetric | null;
  /** Already saved against this entry. */
  photos: BodyPhoto[];
  onViewPhoto: (id: string) => void;
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
  // Nothing touches the database until Save, so closing the sheet really is
  // "never mind", photos included.
  const [pending, setPending] = useState<File[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const kept = photos.filter((p) => !removed.has(p.id));

  async function save() {
    setSaving(true);
    setPhotoError(null);
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
    if (removed.size > 0) await db.bodyPhotos.bulkDelete([...removed]);
    try {
      for (const file of pending) await addPhoto(record.id, record.localDate, file);
      // A moved date moves the photos with it, so the gallery stays in order.
      if (metric && metric.localDate !== localDate) {
        await db.bodyPhotos.where('bodyMetricId').equals(record.id).modify({ localDate });
      }
    } catch (err) {
      // The weigh-in is saved; say which part was not, and keep the sheet open.
      setPhotoError(err instanceof Error ? err.message : 'No se pudo guardar la foto.');
      setSaving(false);
      return;
    }
    onClose();
  }

  async function remove() {
    if (metric) {
      await db.transaction('rw', db.bodyMetrics, db.bodyPhotos, async () => {
        await db.bodyPhotos.where('bodyMetricId').equals(metric.id).delete();
        await db.bodyMetrics.delete(metric.id);
      });
    }
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

        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            Photos (optional)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {kept.map((photo) => (
              <PhotoThumb
                key={photo.id}
                blob={photo.blob}
                onClick={() => onViewPhoto(photo.id)}
                className="aspect-[3/4]"
              >
                <RemoveBadge onRemove={() => setRemoved((prev) => new Set(prev).add(photo.id))} />
              </PhotoThumb>
            ))}
            {pending.map((file, i) => (
              <PendingThumb
                key={`${file.name}-${i}`}
                file={file}
                onRemove={() => setPending((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
            <AddPhotoButton
              className="aspect-[3/4]"
              onPick={(files) => setPending((prev) => [...prev, ...files])}
            />
          </div>
          {photoError ? <p className="mt-1.5 text-xs text-danger">{photoError}</p> : null}
        </div>

        <Field label="Notes">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Button variant="primary" className="w-full" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
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

function PendingThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useBlobUrl(file);
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-raised">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      <RemoveBadge onRemove={onRemove} />
    </div>
  );
}

/** A span, not a button: it sits inside the thumbnail's own button. */
function RemoveBadge({ onRemove }: { onRemove: () => void }) {
  return (
    <span
      role="button"
      aria-label="Remove photo"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </span>
  );
}
