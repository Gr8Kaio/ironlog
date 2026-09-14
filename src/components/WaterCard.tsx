import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import type { WaterLog } from '../db/types';
import { getWaterForDate } from '../db/queries';
import { formatTime, toEpoch } from '../lib/dates';
import { Button, Card, Field, Sheet, TextInput, cx } from './ui';
import { DropIcon } from './icons';

/**
 * Quick adds. Mate is here because it is what actually gets drunk all day
 * around here, and it counts: it is water with yerba in it.
 */
const PRESETS = [
  { label: 'Vaso', ml: 250 },
  { label: 'Botella', ml: 500 },
  { label: 'Mate', ml: 500, note: 'Mate' },
];

export function WaterCard({
  localDate,
  targetMl,
  isToday,
}: {
  localDate: string;
  targetMl: number;
  isToday: boolean;
}) {
  const [open, setOpen] = useState(false);
  const logs = useLiveQuery(() => getWaterForDate(localDate), [localDate], undefined);

  if (!logs || targetMl <= 0) return null;

  const rows = logs;
  const total = rows.reduce((sum, l) => sum + l.ml, 0);
  const pct = targetMl > 0 ? Math.min(100, (total / targetMl) * 100) : 0;
  const done = total >= targetMl;

  async function add(ml: number, label?: string) {
    // A past day has no meaningful clock time, so it lands at midday rather
    // than at whatever hour you happened to be backfilling it.
    const at = isToday ? Date.now() : toEpoch(localDate, '12:00');
    await db.waterLogs.add({ id: newId(), localDate, loggedAt: at, ml, label });
  }

  async function undoLast() {
    // Captured outside the closure: the narrowing from the guard above does
    // not survive into an async callback.
    const last = rows[rows.length - 1];
    if (last) await db.waterLogs.delete(last.id);
  }

  return (
    <>
      <Card className="mt-3 p-3">
        <div className="flex items-center gap-3">
          <span
            className={cx(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              done ? 'bg-stride/20 text-stride' : 'bg-stride/10 text-stride',
            )}
          >
            <DropIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Agua</p>
            <p className="tabular text-[11px] text-faint">
              {(total / 1000).toFixed(total >= 1000 ? 1 : 2).replace('.', ',')} de{' '}
              {(targetMl / 1000).toFixed(1).replace('.', ',')} L
              {done ? <span className="text-good"> · listo</span> : null}
            </p>
          </div>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={undoLast}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted active:text-fg"
            >
              Deshacer
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-raised">
          <div
            className={cx('h-full rounded-full', done ? 'bg-good' : 'bg-stride')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => add(p.ml, p.note)}
              className="flex min-h-11 flex-col items-center justify-center rounded-xl bg-raised active:bg-line"
            >
              <span className="text-xs font-medium">{p.label}</span>
              <span className="tabular text-[10px] text-faint">{p.ml} ml</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 flex-col items-center justify-center rounded-xl bg-raised active:bg-line"
          >
            <span className="text-xs font-medium">Otro</span>
            <span className="text-[10px] text-faint">ml</span>
          </button>
        </div>

        {rows.length > 0 ? <Timeline logs={rows} /> : null}
      </Card>

      <CustomSheet open={open} onClose={() => setOpen(false)} onAdd={add} />
    </>
  );
}

/** Every drink of the day as one dot each, so the rhythm is visible. */
function Timeline({ logs }: { logs: WaterLog[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
      {logs.map((log) => (
        <span
          key={log.id}
          title={`${log.label ?? 'Agua'} · ${log.ml} ml · ${formatTime(log.loggedAt)}`}
          className={cx(
            'h-1.5 rounded-full',
            log.label ? 'bg-fuel/60' : 'bg-stride/60',
          )}
          // Width tracks volume, so a thermos does not look like a sip.
          style={{ width: `${Math.max(8, Math.min(48, log.ml / 12))}px` }}
        />
      ))}
    </div>
  );
}

function CustomSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (ml: number, label?: string) => Promise<void>;
}) {
  const [ml, setMl] = useState('');
  const [label, setLabel] = useState('');
  const value = Number(ml.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;

  async function save() {
    if (!valid) return;
    await onAdd(Math.round(value), label.trim() || undefined);
    setMl('');
    setLabel('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Otra cantidad">
      <div className="space-y-3">
        <Field label="Mililitros">
          <TextInput
            inputMode="decimal"
            value={ml}
            onChange={(e) => setMl(e.target.value)}
            placeholder="750"
            autoFocus
          />
        </Field>
        <Field label="Qué fue" hint="Opcional. Mate, café, gaseosa.">
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Termo de mate"
            autoComplete="off"
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={save} disabled={!valid}>
            Agregar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
