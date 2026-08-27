import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db/db';
import { fmtKg } from '../lib/calc';
import { solvePlates } from '../lib/plates';
import { Chip, cx } from './ui';

/**
 * Competition plate colours. Recognising the load by colour is faster than
 * reading a number off the rim, which is the point of the helper.
 */
const PLATE_STYLE: Record<number, { fill: string; text: string; height: number }> = {
  25: { fill: 'bg-red-600', text: 'text-white', height: 100 },
  20: { fill: 'bg-blue-600', text: 'text-white', height: 100 },
  15: { fill: 'bg-yellow-400', text: 'text-black', height: 92 },
  10: { fill: 'bg-green-600', text: 'text-white', height: 82 },
  5: { fill: 'bg-neutral-200', text: 'text-black', height: 64 },
  2.5: { fill: 'bg-neutral-800 border border-neutral-500', text: 'text-white', height: 52 },
  1.25: { fill: 'bg-neutral-400', text: 'text-black', height: 42 },
};

const fallbackStyle = { fill: 'bg-neutral-600', text: 'text-white', height: 56 };

export function PlateMath({ targetKg }: { targetKg: number }) {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  if (!settings) return null;

  const solution = solvePlates(targetKg, settings.barWeightKg, settings.plateInventory);
  const plates = solution.perSide.flatMap((p) => Array.from({ length: p.count }, () => p.weightKg));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="tabular text-3xl font-semibold text-iron">
            {fmtKg(targetKg)}
            <span className="ml-1 text-sm font-medium text-muted">kg</span>
          </div>
          <div className="mt-0.5 text-xs text-faint">
            {fmtKg(settings.barWeightKg)} kg bar · per side
          </div>
        </div>
        {solution.exact ? (
          <Chip tone="good">Exact</Chip>
        ) : (
          <Chip tone="gold">{solution.problem}</Chip>
        )}
      </div>

      {/* The bar, drawn end-on from the collar outward. */}
      <div className="mt-4 flex h-28 items-center gap-1 overflow-x-auto rounded-xl bg-ink px-3">
        <div className="h-2 w-6 shrink-0 rounded-l bg-neutral-500" />
        <div className="h-5 w-2 shrink-0 rounded-sm bg-neutral-400" />
        {plates.length === 0 ? (
          <span className="pl-3 text-sm text-faint">Empty bar</span>
        ) : (
          plates.map((weight, i) => {
            const style = PLATE_STYLE[weight] ?? fallbackStyle;
            return (
              <div
                key={`${weight}-${i}`}
                style={{ height: `${style.height}%` }}
                className={cx(
                  'flex w-7 shrink-0 items-center justify-center rounded-sm',
                  style.fill,
                )}
              >
                <span className={cx('text-[9px] font-bold', style.text)}>{fmtKg(weight)}</span>
              </div>
            );
          })
        )}
        <div className="h-2 flex-1 bg-neutral-500" />
      </div>

      <p className="tabular mt-3 text-sm text-muted">
        {solution.perSide.length === 0
          ? 'Just the bar.'
          : solution.perSide.map((p) => `${p.count} x ${fmtKg(p.weightKg)}`).join('  ·  ')}
        <span className="text-faint"> per side</span>
      </p>

      {!solution.exact && solution.shortByKg > 0 ? (
        <p className="mt-2 text-xs text-faint">
          Short by {fmtKg(solution.shortByKg)} kg with the plates in your inventory. Adjust the rack
          in Settings if this is wrong.
        </p>
      ) : null}
    </div>
  );
}
