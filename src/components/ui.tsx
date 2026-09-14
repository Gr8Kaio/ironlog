import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { appHeight } from '../lib/viewport';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ layout

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  // The dock sits in normal flow below this now, so it needs no clearance
  // here — only a screen with its own floating footer (the rest timer)
  // overrides this via className.
  return <div className={cx('px-4 pb-6', className)}>{children}</div>;
}

export function TopBar({
  title,
  subtitle,
  left,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line-soft bg-ink/90 px-4 pt-safe backdrop-blur-lg">
      <div className="flex min-h-14 items-center gap-3 py-2">
        {left}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base = 'rounded-2xl border border-line-soft bg-surface';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(base, 'w-full text-left active:bg-raised', className)}
      >
        {children}
      </button>
    );
  }
  return <div className={cx(base, className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-end justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-widest text-faint uppercase">{children}</h2>
      {action}
    </div>
  );
}

// ----------------------------------------------------------------- controls

type ButtonVariant = 'primary' | 'run' | 'ghost' | 'outline' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-iron text-ink font-semibold active:bg-iron/80',
  run: 'bg-stride text-ink font-semibold active:bg-stride/80',
  ghost: 'bg-raised text-fg active:bg-line',
  outline: 'border border-line text-fg active:bg-raised',
  danger: 'bg-danger/15 text-danger border border-danger/40 active:bg-danger/25',
};

export function Button({
  children,
  onClick,
  variant = 'ghost',
  className,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        // 48px floor: this gets tapped with sweaty hands between sets.
        'flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'iron' | 'stride' | 'gold' | 'good' | 'fuel';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-raised text-muted',
    iron: 'bg-iron/15 text-iron',
    stride: 'bg-stride/15 text-stride',
    gold: 'bg-gold/15 text-gold',
    good: 'bg-good/15 text-good',
    fuel: 'bg-fuel/15 text-fuel',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-xl bg-surface p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'min-h-10 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
            option.value === value ? 'bg-raised text-fg' : 'text-muted active:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  'w-full min-h-12 rounded-xl border border-line bg-surface px-3 text-fg placeholder:text-faint focus:border-iron focus:outline-none';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(INPUT_CLASS, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(INPUT_CLASS, 'py-3', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(INPUT_CLASS, 'appearance-none', props.className)} />;
}

// -------------------------------------------------------------------- stats

export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: 'iron' | 'stride' | 'gold' | 'fuel';
}) {
  const toneClass =
    tone === 'iron'
      ? 'text-iron'
      : tone === 'stride'
        ? 'text-stride'
        : tone === 'gold'
          ? 'text-gold'
          : tone === 'fuel'
            ? 'text-fuel'
            : 'text-fg';
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <div className="text-[10px] font-semibold tracking-widest text-faint uppercase">{label}</div>
      <div className={cx('tabular mt-0.5 text-xl leading-none font-semibold', toneClass)}>
        {value}
        {unit ? <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
      <p className="font-medium text-muted">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-xs text-sm text-faint">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------- sheets

/**
 * How much of the layout viewport the on-screen keyboard is covering.
 *
 * `position: fixed` is laid out against the *layout* viewport, which iOS does
 * not shrink when the keyboard opens — so a bottom-anchored sheet ends up
 * underneath it and you cannot see what you are typing. The visual viewport is
 * the only thing that knows, so the sheet is lifted by hand.
 */
function useKeyboardInset(active: boolean): { inset: number; visibleHeight: number } {
  const [state, setState] = useState({ inset: 0, visibleHeight: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;

    const update = () => {
      // offsetTop matters: iOS scrolls the visual viewport up as it opens.
      // The sheet's bottom is the app shell's, which can sit below innerHeight.
      const covered = appHeight() - vv.height - vv.offsetTop;
      setState({ inset: Math.max(0, Math.round(covered)), visibleHeight: Math.round(vv.height) });
    };
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);

  return state;
}

/**
 * Bottom sheet. Everything modal in the app uses this: a dialog anchored to
 * the top of a phone screen is unreachable one-handed.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  const { inset, visibleHeight } = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-(--app-h) flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className="animate-slide-up relative max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-safe"
        // Sits on top of the keyboard rather than behind it, and gives up the
        // height the keyboard took so the sheet still scrolls to its own end.
        style={
          inset > 0
            ? { marginBottom: inset, maxHeight: Math.max(200, visibleHeight - 24) }
            : undefined
        }
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line-soft bg-surface px-4 py-3">
          <div className="min-w-0 flex-1 font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Small inline confirm, used before anything destructive. */
export function ConfirmRow({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 p-3">
      <p className="text-sm text-fg">{message}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="danger" className="flex-1" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
