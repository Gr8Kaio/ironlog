import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db/db';
import { getDayOverridesForWeekOf, getLogsForWeekOf, setDayOverride } from '../db/queries';
import type { DayIntakeOverride } from '../db/types';
import {
  buildWeekBudget,
  fmtKcal,
  planBigDay,
  weekDayTotals,
  type Assumption,
  type DayTotal,
} from '../lib/nutrition';
import { formatDate, formatDateShort, todayLocalDate } from '../lib/dates';
import { Stepper } from '../components/Stepper';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  SectionTitle,
  Sheet,
  TextInput,
  TopBar,
  cx,
} from '../components/ui';
import { ChevronLeft } from '../components/icons';

const DAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function FuelWeek() {
  const navigate = useNavigate();
  const today = todayLocalDate();

  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const logs = useLiveQuery(() => getLogsForWeekOf(today), [today], undefined);
  const overrides = useLiveQuery(() => getDayOverridesForWeekOf(today), [today], undefined);
  const [ruling, setRuling] = useState<DayTotal | null>(null);

  const back = (
    <button
      type="button"
      onClick={() => navigate('/fuel')}
      className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted active:bg-raised"
    >
      <ChevronLeft className="size-5" />
    </button>
  );

  if (!settings || !logs || !overrides) {
    return (
      <Screen>
        <TopBar title="Semana" left={back} />
      </Screen>
    );
  }

  const target = settings.kcalTarget ?? 0;
  if (target <= 0) {
    return (
      <Screen>
        <TopBar title="Semana" left={back} />
        <EmptyState
          title="Falta tu objetivo de calorías"
          body="El presupuesto semanal son siete veces tu objetivo diario. Sin ese número no hay presupuesto."
        />
      </Screen>
    );
  }

  const assumption: Assumption = {
    kcal: settings.assumedDayKcal ?? null,
    targetKcal: target,
    overrides,
  };
  const budget = buildWeekBudget(logs, target, today, assumption);
  const days = weekDayTotals(logs, today, assumption);
  const daysRemaining = budget.daysLeft + 1;
  // Headroom above the target so its marker never lands on the right edge,
  // where the rounded corner would swallow it on a week with no big day.
  const peak = Math.max(target * 1.15, ...days.map((d) => d.kcal));

  const ahead = budget.driftKcal < 0;
  const drift = Math.abs(budget.driftKcal);

  return (
    <Screen>
      <TopBar
        title="Semana"
        subtitle={`desde ${formatDate(budget.weekStartDate)}`}
        left={back}
      />

      {/* Budget --------------------------------------------------------- */}
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              {budget.remainingKcal < 0 ? 'Te pasaste por' : 'Queda en la semana'}
            </p>
            <p
              className={cx(
                'tabular mt-1 text-4xl leading-none font-semibold',
                budget.remainingKcal < 0 ? 'text-danger' : 'text-fuel',
              )}
            >
              {fmtKcal(Math.abs(budget.remainingKcal))}
              <span className="ml-1 text-sm font-medium text-muted">kcal</span>
            </p>
          </div>
          <p className="tabular shrink-0 text-right text-xs text-muted">
            {fmtKcal(budget.consumedKcal)} / {fmtKcal(budget.budgetKcal)}
          </p>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
          <div
            className={cx(
              'h-full rounded-full',
              budget.remainingKcal < 0 ? 'bg-danger' : 'bg-fuel',
            )}
            style={{
              width: `${Math.min(100, (budget.consumedKcal / Math.max(1, budget.budgetKcal)) * 100)}%`,
            }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Por día, {daysRemaining === 1 ? 'hoy' : `${daysRemaining} días`}
            </p>
            <p className="tabular mt-0.5 text-xl leading-none font-semibold text-fuel">
              {fmtKcal(Math.max(0, budget.perDayLeft ?? 0))}
              <span className="ml-0.5 text-xs font-medium text-muted">kcal</span>
            </p>
          </div>
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              {ahead ? 'Vas adelante' : 'Vas atrás'}
            </p>
            <p
              className={cx(
                'tabular mt-0.5 text-xl leading-none font-semibold',
                ahead ? 'text-good' : 'text-gold',
              )}
            >
              {fmtKcal(drift)}
              <span className="ml-0.5 text-xs font-medium text-muted">kcal</span>
            </p>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-snug text-faint">
          {ahead
            ? 'Comiste menos de lo planeado hasta acá. Ese margen es tuyo: gastalo cuando lo necesites en vez de perderlo.'
            : 'Comiste más de lo planeado hasta acá. Se reparte entre los días que quedan, no hay nada que compensar de golpe.'}
        </p>

        {/*
          The assumption is load-bearing for every number above it, so it says
          so here rather than only as a chip further down the page. A week that
          silently invented 5.800 kcal would be worse than one that read the
          gaps as zero.
        */}
        {budget.assumedDays.length > 0 ? (
          <p className="mt-2 rounded-lg bg-gold/10 px-2.5 py-2 text-[11px] leading-snug text-gold">
            {budget.assumedDays.length === 1
              ? `Falta el registro del ${formatDateShort(budget.assumedDays[0].localDate)}, así que se cuenta en ${fmtKcal(budget.assumedDays[0].kcal)} kcal.`
              : `Faltan ${budget.assumedDays.length} días sin registrar, así que se cuentan asumidos: ${fmtKcal(budget.assumedKcal)} kcal que no están anotadas.`}{' '}
            Tocá el día para cambiarlo.
          </p>
        ) : null}
      </Card>

      {/* Days ----------------------------------------------------------- */}
      <SectionTitle
        action={
          budget.estimatedCount > 0 ? (
            <span className="text-[11px] text-faint">
              {budget.estimatedCount} de {budget.loggedCount} estimadas
            </span>
          ) : undefined
        }
      >
        Día por día
      </SectionTitle>

      <Card className="space-y-1.5 p-3">
        {days.map((day, i) => (
          <DayRow
            key={day.localDate}
            day={day}
            initial={DAY_INITIALS[i]}
            target={target}
            peak={peak}
            onOpen={() =>
              navigate(day.isToday ? '/fuel' : `/fuel/day/${day.localDate}`)
            }
            onRule={day.isToday || day.isFuture ? null : () => setRuling(day)}
          />
        ))}
      </Card>

      <p className="mt-1.5 px-1 text-[11px] leading-snug text-faint">
        Un día pasado sin anotar, o anotado a medias, se cuenta en{' '}
        {settings.assumedDayKcal ? `${fmtKcal(settings.assumedDayKcal)} kcal` : 'lo que diga el log'}
        . Tocá el ⋯ de cualquier día para decidirlo a mano.
      </p>

      {/* Planner -------------------------------------------------------- */}
      <SectionTitle>Planificar un día grande</SectionTitle>
      <BigDayPlanner
        remainingKcal={budget.remainingKcal}
        daysLeft={budget.daysLeft}
        budget={budget}
      />

      <DayRulingSheet
        day={ruling}
        override={ruling ? (overrides.get(ruling.localDate) ?? null) : null}
        defaultKcal={settings.assumedDayKcal ?? target}
        onClose={() => setRuling(null)}
      />
    </Screen>
  );
}

function DayRow({
  day,
  initial,
  target,
  peak,
  onOpen,
  onRule,
}: {
  day: DayTotal;
  initial: string;
  target: number;
  peak: number;
  onOpen: () => void;
  /** Null on today and on days still ahead, which cannot be ruled on. */
  onRule: (() => void) | null;
}) {
  const pct = peak > 0 ? (day.kcal / peak) * 100 : 0;
  const targetPct = peak > 0 ? (target / peak) * 100 : 0;
  const over = day.kcal > target;

  return (
    <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={onOpen}
      disabled={day.isFuture}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 text-left active:bg-raised disabled:active:bg-transparent"
    >
      <span
        className={cx(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold',
          day.isToday ? 'bg-fuel/20 text-fuel' : 'bg-raised text-faint',
        )}
      >
        {initial}
      </span>

      <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-raised">
        {/*
          An assumed day is hatched rather than solid. It has to read as a
          different kind of number at a glance, or the chart quietly claims to
          know something it does not.
        */}
        <span
          className={cx(
            'absolute inset-y-0 left-0 rounded-md',
            day.isFuture ? 'bg-line' : day.assumed ? 'bg-gold/30' : over ? 'bg-gold/70' : 'bg-fuel/70',
          )}
          style={{
            width: `${Math.min(100, pct)}%`,
            ...(day.assumed
              ? {
                  backgroundImage:
                    'repeating-linear-gradient(135deg, var(--color-gold-dim) 0 2px, transparent 2px 6px)',
                }
              : null),
          }}
        />
        {/* Where the log actually stops, on a day that is being filled in. */}
        {day.assumed && day.loggedKcal > 0 ? (
          <span
            className="absolute inset-y-0 left-0 rounded-md bg-fuel/70"
            style={{ width: `${Math.min(100, peak > 0 ? (day.loggedKcal / peak) * 100 : 0)}%` }}
          />
        ) : null}
        {/* Where the flat daily target sits, so over and under read at a glance. */}
        <span
          className="absolute inset-y-0 w-px bg-fg/30"
          style={{ left: `${Math.min(100, targetPct)}%` }}
        />
      </span>

      <span
        className={cx(
          'tabular w-14 shrink-0 text-right text-xs',
          day.kcal === 0 ? 'text-faint' : day.assumed ? 'text-gold' : over ? 'text-gold' : 'text-fg',
        )}
      >
        {day.kcal === 0 ? (day.isFuture ? '—' : '0') : fmtKcal(day.kcal)}
      </span>

      {day.assumed ? (
        <Chip tone="gold">{day.assumedByHand ? 'a mano' : 'asumido'}</Chip>
      ) : day.estimatedCount > 0 ? (
        <Chip tone="gold">est</Chip>
      ) : null}
    </button>

      {onRule ? (
        <button
          type="button"
          onClick={onRule}
          aria-label={`Cómo contar el ${day.localDate}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint active:bg-raised"
        >
          <span className="text-sm leading-none">⋯</span>
        </button>
      ) : (
        <span className="size-7 shrink-0" />
      )}
    </div>
  );
}

/**
 * The manual say over one past day.
 *
 * Three states rather than a switch, because "leave it alone" and "I really
 * did only eat that" are different claims and only one of them should survive
 * a change to the assumed figure in Settings.
 */
function DayRulingSheet({
  day,
  override,
  defaultKcal,
  onClose,
}: {
  day: DayTotal | null;
  override: DayIntakeOverride | null;
  defaultKcal: number;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState<number | null>(null);

  if (!day) return null;

  const mode = override?.mode ?? 'auto';
  const kcal = custom ?? override?.kcal ?? defaultKcal;

  async function rule(next: 'auto' | 'logged' | 'assumed', value?: number) {
    if (!day) return;
    await setDayOverride(day.localDate, next === 'auto' ? null : next, value ?? null);
    if (next !== 'assumed') onClose();
  }

  return (
    <Sheet open onClose={onClose} title={formatDate(day.localDate)}>
      <div className="space-y-3">
        <div className="rounded-xl bg-raised px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
            Anotado ese día
          </p>
          <p className="tabular mt-0.5 text-sm">
            <span className="text-lg font-semibold text-fuel">{fmtKcal(day.loggedKcal)}</span>
            <span className="text-xs text-muted">
              {' '}
              kcal en {day.logCount} {day.logCount === 1 ? 'entrada' : 'entradas'}
            </span>
          </p>
          {day.assumed ? (
            <p className="mt-1 text-[11px] leading-snug text-gold">
              La semana lo está contando en {fmtKcal(day.kcal)} kcal.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <RuleOption
            active={mode === 'auto'}
            title="Automático"
            body="Si el día quedó muy por debajo del objetivo, se asume. Si no, vale lo anotado."
            onClick={() => void rule('auto')}
          />
          <RuleOption
            active={mode === 'logged'}
            title="Vale lo anotado"
            body="Ese día comí eso y nada más. No lo rellenes aunque parezca poco."
            onClick={() => void rule('logged')}
          />
          <RuleOption
            active={mode === 'assumed'}
            title="No lo anoté"
            body="Contalo asumido, con el número de abajo."
            onClick={() => void rule('assumed', kcal)}
          />
        </div>

        {mode === 'assumed' ? (
          <>
            <Stepper
              label="Cuánto asumir"
              value={kcal}
              onChange={setCustom}
              step={50}
              min={0}
              max={8000}
              suffix="kcal"
              tone="iron"
            />
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                void rule('assumed', kcal).then(onClose);
              }}
            >
              Guardar
            </Button>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function RuleOption({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-xl border px-3 py-2.5 text-left',
        active ? 'border-fuel/50 bg-fuel/10' : 'border-line bg-raised active:bg-line',
      )}
    >
      <span className={cx('block text-sm font-medium', active ? 'text-fuel' : 'text-fg')}>
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-faint">{body}</span>
    </button>
  );
}

function BigDayPlanner({
  remainingKcal,
  daysLeft,
  budget,
}: {
  remainingKcal: number;
  daysLeft: number;
  budget: ReturnType<typeof buildWeekBudget>;
}) {
  const [value, setValue] = useState('');
  const kcal = Number(value.replace(',', '.'));
  const valid = Number.isFinite(kcal) && kcal > 0;
  const perOther = valid ? planBigDay(budget, kcal) : null;

  if (daysLeft < 1) {
    return (
      <Card className="p-3">
        <p className="text-[11px] leading-snug text-faint">
          Es el último día de la semana, así que no queda ningún otro día entre el que repartir.
          Volvé a mirar esto el lunes.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-3">
      <p className="text-[11px] leading-snug text-faint">
        Un asado, un cumpleaños, la mesa de tu suegra. Poné lo que va a costar{' '}
        <span className="text-muted">ese día entero</span> — no solo la comida grande, porque ese día
        también desayunás — y te digo con cuánto quedan los otros días.
      </p>

      <TextInput
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="3000"
      />

      {valid && perOther !== null ? (
        <div
          className={cx(
            'rounded-xl px-3 py-2.5',
            perOther < 1200 ? 'bg-danger/10' : 'bg-raised',
          )}
        >
          <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
            Los otros {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
          </p>
          <p
            className={cx(
              'tabular mt-0.5 text-2xl leading-none font-semibold',
              perOther < 1200 ? 'text-danger' : 'text-fuel',
            )}
          >
            {fmtKcal(Math.max(0, perOther))}
            <span className="ml-1 text-xs font-medium text-muted">kcal cada uno</span>
          </p>
          <p className="mt-2 text-[11px] leading-snug text-faint">
            {perOther < 1200
              ? 'Eso deja los otros días demasiado bajos para sostener el músculo en déficit. Bajá un poco el día grande, o aceptá que esta semana el déficit sea menor: una semana floja no rompe nada, dos meses de días de 1.000 kcal sí.'
              : 'Ese día ya está pago. Comelo sin hacer cuentas en la mesa.'}
          </p>
        </div>
      ) : null}

      <p className="tabular text-[11px] text-faint">
        Quedan {fmtKcal(remainingKcal)} kcal para {daysLeft + 1}{' '}
        {daysLeft + 1 === 1 ? 'día' : 'días'}.
      </p>
    </Card>
  );
}
