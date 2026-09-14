import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import type { RunType } from '../db/types';
import { cx } from './ui';

/**
 * Chart theme. Recharts needs literal colours rather than CSS custom
 * properties, so the tokens are mirrored here as hex and must be kept in step
 * with index.css.
 */
export const CHART = {
  iron: '#f97316',
  stride: '#22d3ee',
  gold: '#fbbf24',
  fuel: '#a3e635',
  grid: '#22262c',
  axis: '#6b7280',
  text: '#9aa2ae',
  surface: '#141619',
};

/**
 * Run-type series colours, validated as a categorical set against the dark
 * chart surface (#141619): worst adjacent CVD separation ΔE 13.2, normal
 * vision 19.3, all five at or above 3:1 contrast.
 *
 * Colour is bound to the run type, never to position in the filtered list, so
 * hiding tempo does not repaint the lines that remain.
 */
export const RUN_TYPE_COLOR: Record<RunType, string> = {
  easy: '#199e70',
  tempo: '#3987e5',
  intervals: '#c98500',
  long: '#d55181',
  race: '#9085e9',
};

export const AXIS_PROPS = {
  stroke: CHART.axis,
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART.text, fontSize: 10 },
} as const;

export function ChartFrame({
  title,
  hint,
  action,
  height = 190,
  children,
  empty,
  footer,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  height?: number;
  children: React.ReactElement;
  empty?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line-soft bg-surface p-3">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {hint ? <p className="truncate text-[11px] text-faint">{hint}</p> : null}
        </div>
        {action}
      </header>
      {empty ? (
        <div
          className="flex items-center justify-center text-xs text-faint"
          style={{ height }}
        >
          Not enough data yet
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
      {footer}
    </section>
  );
}

/** Shared tooltip shell so every chart in the app reads the same. */
export function TooltipBox({
  label,
  rows,
}: {
  label: ReactNode;
  rows: { key: string; color?: string; name: string; value: ReactNode }[];
}) {
  return (
    <div className="rounded-lg border border-line bg-ink/95 px-2.5 py-2 shadow-lg backdrop-blur">
      <div className="mb-1 text-[11px] font-medium text-muted">{label}</div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-[11px]">
            {row.color ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span className="text-faint">{row.name}</span>
            <span className="tabular ml-auto font-semibold text-fg">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Legend swatches. Identity never rides on colour alone, so the label is
 * always present next to the mark.
 */
export function Legend({
  items,
  active,
  onToggle,
}: {
  items: { key: string; label: string; color: string }[];
  active?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map((item) => {
        const on = !active || active.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            disabled={!onToggle}
            onClick={() => onToggle?.(item.key)}
            className={cx(
              'flex items-center gap-1.5 text-[11px] transition-opacity',
              on ? 'opacity-100' : 'opacity-35',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
