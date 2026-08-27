import { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from './ui';

/**
 * The primary input of the whole app: weight and reps are adjusted, not typed.
 *
 * Hold to repeat, accelerating after the first second, because moving from 20
 * to 100 kg one tap at a time is not acceptable. The number itself is still a
 * button, so anything far from the current value can be typed directly.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  format = (v: number) => String(v),
  label,
  suffix,
  tone = 'iron',
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  label?: string;
  suffix?: string;
  tone?: 'iron' | 'stride';
  size?: 'md' | 'lg';
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const timer = useRef<number | null>(null);
  // The repeat interval needs the current value without re-subscribing on
  // every change. Synced in an effect rather than assigned during render.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  // Float steps: 0.1 + 0.2 must not become 0.30000000000000004 in the log.
  const bump = useCallback(
    (direction: number) => {
      const next = clamp(Math.round((latest.current + direction * step) * 1000) / 1000);
      latest.current = next;
      onChange(next);
    },
    [clamp, onChange, step],
  );

  const stopRepeat = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startRepeat = useCallback(
    (direction: number) => {
      bump(direction);
      stopRepeat();
      let elapsed = 0;
      timer.current = window.setInterval(() => {
        elapsed += 1;
        // First second at a readable pace, then fast enough to cross the rack.
        if (elapsed > 6 || elapsed % 2 === 0) bump(direction);
      }, 110);
    },
    [bump, stopRepeat],
  );

  useEffect(() => stopRepeat, [stopRepeat]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setTyping(false);
  };

  const height = size === 'lg' ? 'h-16' : 'h-14';
  const textSize = size === 'lg' ? 'text-3xl' : 'text-2xl';
  const toneClass = tone === 'stride' ? 'text-stride' : 'text-iron';

  return (
    <div className="min-w-0">
      {label ? (
        <div className="mb-1 text-[10px] font-semibold tracking-widest text-faint uppercase">
          {label}
        </div>
      ) : null}
      <div className={cx('flex items-stretch overflow-hidden rounded-xl bg-raised', height)}>
        <HoldButton
          onStart={() => startRepeat(-1)}
          onStop={stopRepeat}
          disabled={value <= min}
          className="rounded-l-xl"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14" strokeLinecap="round" />
          </svg>
        </HoldButton>

        {typing ? (
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setTyping(false);
            }}
            className={cx(
              'tabular w-full min-w-0 flex-1 bg-transparent text-center font-semibold outline-none',
              textSize,
              toneClass,
            )}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(value));
              setTyping(true);
            }}
            className="flex min-w-0 flex-1 flex-col items-center justify-center leading-none"
          >
            <span className={cx('tabular font-semibold', textSize, toneClass)}>{format(value)}</span>
            {suffix ? <span className="mt-0.5 text-[10px] text-faint">{suffix}</span> : null}
          </button>
        )}

        <HoldButton
          onStart={() => startRepeat(1)}
          onStop={stopRepeat}
          disabled={value >= max}
          className="rounded-r-xl"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </HoldButton>
      </div>
    </div>
  );
}

function HoldButton({
  children,
  onStart,
  onStop,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      // Pointer events rather than click: the repeat has to begin on press,
      // and pointercancel is what fires when a scroll steals the gesture.
      onPointerDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      onPointerCancel={onStop}
      onContextMenu={(e) => e.preventDefault()}
      className={cx(
        'flex w-14 shrink-0 items-center justify-center text-muted select-none',
        'active:bg-line active:text-fg disabled:opacity-25',
        className,
      )}
    >
      {children}
    </button>
  );
}
