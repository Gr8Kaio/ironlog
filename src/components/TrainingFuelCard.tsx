import { useState } from 'react';
import type { PhaseOverride, TrainingContext } from '../lib/trainingFuel';
import { phaseCopy } from '../lib/trainingFuel';
import { Card, Segmented, cx } from './ui';
import { BarbellIcon, ChevronRight, ShoeIcon } from './icons';

const OVERRIDES: readonly { value: PhaseOverride; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'pre', label: 'Voy a entrenar' },
  { value: 'post', label: 'Ya entrené' },
  { value: 'rest', label: 'Descanso' },
];

/**
 * Where the day sits relative to training, and the chance to correct it.
 *
 * The automatic read is right most days and wrong on exactly the days that
 * matter — the session you moved, the one you skipped, the extra one. One tap
 * opens the override, which is why the card is a button rather than a label.
 */
export function TrainingFuelCard({
  ctx,
  override,
  onOverride,
}: {
  ctx: TrainingContext;
  override: PhaseOverride;
  onOverride: (next: PhaseOverride) => void;
}) {
  const [open, setOpen] = useState(false);
  const copy = phaseCopy(ctx);
  const Icon = ctx.kind === 'run' ? ShoeIcon : BarbellIcon;

  const tone =
    ctx.phase === 'post' || ctx.phase === 'during'
      ? 'bg-iron/15 text-iron'
      : ctx.phase === 'pre'
        ? 'bg-fuel/15 text-fuel'
        : 'bg-raised text-muted';

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-raised"
      >
        <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{copy.title}</span>
          <span className="block truncate text-[11px] text-faint">{copy.detail}</span>
        </span>
        <ChevronRight
          className={cx('size-4 shrink-0 text-faint transition-transform', open && 'rotate-90')}
        />
      </button>

      {open ? (
        <div className="border-t border-line-soft p-3">
          <p className="mb-2 text-[11px] leading-snug text-faint">
            Las ideas de comida se ordenan por esto. Si hoy no es lo que dice, corregilo.
          </p>
          <Segmented options={OVERRIDES} value={override} onChange={onOverride} />
        </div>
      ) : null}
    </Card>
  );
}
