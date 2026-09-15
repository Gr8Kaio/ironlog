/**
 * What the day's training says about what to eat.
 *
 * A plate is not good or bad on its own: it is good or bad *for the next few
 * hours*. Rice and chicken two hours before squats is fuel; the same plate on
 * the couch on a rest day is just calories. IronLog already knows when you
 * lifted and when you ran, which is the one thing a generic tracker can never
 * see, so Fuel reads it.
 *
 * Pure module: types only, no React and no database, so scripts/check-math.ts
 * can exercise it under Node.
 */
import type { Macros } from './nutrition.ts';
import { addDaysToLocalDate, parseLocalDate, todayLocalDate } from './dates.ts';

export const TRAINING_PHASES = ['pre', 'during', 'post', 'trained', 'rest'] as const;
export type TrainingPhase = (typeof TRAINING_PHASES)[number];

/** A lift or a run, flattened to the two things this file cares about. */
export interface TrainingSession {
  kind: 'workout' | 'run';
  localDate: string;
  startedAt: number;
  /** Null while a session is still open. */
  finishedAt: number | null;
  inProgress: boolean;
}

/**
 * How long after the last set a meal is still the recovery meal. Three hours
 * is deliberately generous: the "anabolic window" of the supplement ads is
 * thirty minutes wide, the evidence is not. What matters is that protein and
 * carbohydrate land somewhere near the session, not to the minute.
 */
export const RECOVERY_WINDOW_MIN = 180;
/** Grace past the usual hour before an unlogged session reads as skipped. */
const LATE_GRACE_MIN = 120;
/** Weeks of history the weekday habit is read from. */
const HABIT_WEEKS = 6;
const MIN_OBSERVED_WEEKS = 2;
const HABIT_RATE = 0.5;

export interface TrainingContext {
  phase: TrainingPhase;
  /** What set the phase, when something was actually logged. */
  kind: 'workout' | 'run' | null;
  /** Minutes since the session ended. Only on `during`, `post` and `trained`. */
  sinceMin: number | null;
  /** Minutes until the usual session. Only on `pre`, and only if there is a habit. */
  untilMin: number | null;
  /** Median start hour on this weekday. Null when there is no habit to read. */
  usualHour: number | null;
  /** Share of recent weeks that trained on this weekday, 0-1. */
  habitRate: number;
  /** The phase is a guess from habit rather than something logged. */
  expected: boolean;
  /** You told it what today is, instead of it working it out. */
  declared: boolean;
}

const MINUTE = 60_000;

const sessionEnd = (s: TrainingSession): number => s.finishedAt ?? s.startedAt;

/** Median start hour of a list of sessions, or null when there are none. */
function medianHour(sessions: TrainingSession[]): number | null {
  if (sessions.length === 0) return null;
  const hours = sessions.map((s) => new Date(s.startedAt).getHours()).sort((a, b) => a - b);
  return hours[Math.floor(hours.length / 2)];
}

function daysInclusive(from: string, to: string): number {
  const ms = parseLocalDate(to).getTime() - parseLocalDate(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * How reliably this weekday is a training day.
 *
 * Only weeks the app was actually in use are counted. Otherwise a fresh
 * install - where every week before the first session is empty - would read as
 * "never trains on Tuesdays" and the pre-workout advice would never fire.
 */
function weekdayHabit(
  sessions: TrainingSession[],
  date: string,
): { rate: number; observed: number; expected: boolean } {
  const trained = new Set(sessions.map((s) => s.localDate));
  const earliest = sessions.reduce<string | null>(
    (min, s) => (min === null || s.localDate < min ? s.localDate : min),
    null,
  );
  if (earliest === null) return { rate: 0, observed: 0, expected: false };

  let hits = 0;
  let observed = 0;
  for (let w = 1; w <= HABIT_WEEKS; w++) {
    const day = addDaysToLocalDate(date, -7 * w);
    if (day < earliest) break;
    observed++;
    if (trained.has(day)) hits++;
  }

  if (observed >= MIN_OBSERVED_WEEKS) {
    const rate = hits / observed;
    return { rate, observed, expected: rate >= HABIT_RATE };
  }

  // Too little history for this weekday specifically: fall back to how often
  // you train at all. Someone who trains five days a week is far more likely
  // to be training today than not.
  const span = Math.max(1, daysInclusive(earliest, date));
  const rate = trained.size / span;
  return { rate, observed, expected: rate >= HABIT_RATE };
}

/**
 * Which side of training this meal falls on.
 *
 * A day other than today is read from its own logs only: there is no "about to
 * train" on a Tuesday that is already over, and guessing one would put
 * pre-workout advice on a day whose outcome is already known.
 */
export function trainingContext(
  sessions: TrainingSession[],
  date: string,
  now = Date.now(),
  today = todayLocalDate(),
): TrainingContext {
  const base: TrainingContext = {
    phase: 'rest',
    kind: null,
    sinceMin: null,
    untilMin: null,
    usualHour: null,
    habitRate: 0,
    expected: false,
    declared: false,
  };

  const onDay = sessions.filter((s) => s.localDate === date);

  if (date !== today) {
    const last = [...onDay].sort((a, b) => sessionEnd(b) - sessionEnd(a))[0];
    return last ? { ...base, phase: 'trained', kind: last.kind } : base;
  }

  // A session is only over once the clock says so. A row logged for six in the
  // evening while it is still lunchtime is a plan, not a session you recover
  // from, and reading it as one would put "entrenaste hace 0 min" on a day you
  // have not trained.
  const open = onDay.find((s) => s.inProgress || (s.startedAt <= now && sessionEnd(s) > now));
  if (open) {
    return {
      ...base,
      phase: 'during',
      kind: open.kind,
      sinceMin: Math.max(0, Math.round((now - open.startedAt) / MINUTE)),
    };
  }

  const last = onDay
    .filter((s) => !s.inProgress && sessionEnd(s) <= now)
    .sort((a, b) => sessionEnd(b) - sessionEnd(a))[0];
  if (last) {
    const sinceMin = Math.max(0, Math.round((now - sessionEnd(last)) / MINUTE));
    return {
      ...base,
      phase: sinceMin <= RECOVERY_WINDOW_MIN ? 'post' : 'trained',
      kind: last.kind,
      sinceMin,
    };
  }

  // A session already on the calendar for later today beats any guess about
  // habit: it is the one case where the app knows rather than infers.
  const next = onDay
    .filter((s) => s.startedAt > now)
    .sort((a, b) => a.startedAt - b.startedAt)[0];
  if (next) {
    return {
      ...base,
      phase: 'pre',
      kind: next.kind,
      untilMin: Math.round((next.startedAt - now) / MINUTE),
    };
  }

  // Nothing logged for today at all, so the question is whether something is coming.
  const weekday = parseLocalDate(date).getDay();
  const sameWeekday = sessions.filter((s) => parseLocalDate(s.localDate).getDay() === weekday);
  const habit = weekdayHabit(sessions, date);
  const usualHour = medianHour(sameWeekday.length > 0 ? sameWeekday : sessions);

  if (!habit.expected) return { ...base, habitRate: habit.rate, usualHour };

  const clock = new Date(now);
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const startMin = usualHour === null ? null : usualHour * 60;

  // Past the usual hour by more than the grace period, the session did not
  // happen. Handing someone pre-workout carbs at eleven at night because a
  // Tuesday is "usually leg day" is worse than saying nothing.
  if (startMin !== null && nowMin > startMin + LATE_GRACE_MIN) {
    return { ...base, habitRate: habit.rate, usualHour };
  }

  return {
    ...base,
    phase: 'pre',
    habitRate: habit.rate,
    usualHour,
    untilMin: startMin === null ? null : Math.max(0, startMin - nowMin),
    expected: true,
  };
}

export const PHASE_OVERRIDES = ['auto', 'pre', 'post', 'rest'] as const;
export type PhaseOverride = (typeof PHASE_OVERRIDES)[number];

/**
 * Your word beats the guess. The habit read is right most days and wrong on
 * exactly the days you care about: the unplanned session, the deload, the
 * Saturday you moved training to the morning.
 */
export function applyOverride(ctx: TrainingContext, override: PhaseOverride): TrainingContext {
  if (override === 'auto') return ctx;
  if (override === 'post') {
    return { ...ctx, phase: 'post', expected: false, declared: true, untilMin: null };
  }
  if (override === 'pre') {
    return { ...ctx, phase: 'pre', sinceMin: null, expected: false, declared: true };
  }
  return { ...ctx, phase: 'rest', sinceMin: null, untilMin: null, expected: false, declared: true };
}

// ------------------------------------------------------------------ scoring

/** Share of a plate's energy carried by each macro. */
function shares(m: Macros): { protein: number; carbs: number; fat: number } {
  const kcal = m.kcal > 0 ? m.kcal : m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
  if (kcal <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (m.proteinG * 4) / kcal,
    carbs: (m.carbsG * 4) / kcal,
    fat: (m.fatG * 9) / kcal,
  };
}

const over = (value: number, limit: number): number => Math.max(0, value - limit);
const under = (value: number, floor: number): number => Math.max(0, floor - value);

/**
 * How badly a plate suits the phase, as a penalty added to the calorie fit.
 *
 * Deliberately smaller than the calorie and protein terms in `fitScore`: this
 * reorders plates that already fit the meal, it does not hand you a plate of
 * the wrong size because the timing flatters it.
 *
 *  - **pre** - carbohydrate is what the session runs on; fat and fibre slow
 *    the stomach down, and a heavy plate an hour before squats is a plate you
 *    feel on every rep.
 *  - **post** - protein *and* carbohydrate: repair started, glycogen back.
 *  - **rest** - protein holds, carbohydrate matters less with no session to
 *    fuel, and fibre is what makes a quieter day bearable.
 */
export function phasePenalty(m: Macros, phase: TrainingPhase): number {
  const s = shares(m);
  switch (phase) {
    case 'pre':
    case 'during':
      return 1.2 * under(s.carbs, 0.4) + 1.2 * over(s.fat, 0.25) + 0.04 * over(m.fiberG, 8);
    case 'post':
      return 1.0 * under(s.carbs, 0.35) + 1.0 * under(s.protein, 0.25) + 0.6 * over(s.fat, 0.3);
    case 'trained':
      return 0.5 * under(s.protein, 0.25);
    case 'rest':
      return 0.8 * under(s.protein, 0.25) + 0.6 * over(s.carbs, 0.45) + 0.03 * under(m.fiberG, 10);
  }
}

/**
 * A badge for a plate that genuinely suits the moment, or null.
 *
 * Deliberately stricter than `phasePenalty`, which ranks: a penalty of zero
 * only means nothing is *wrong* with a plate, and most plates that fit the
 * meal clear that bar. A badge on four cards out of six says nothing. These
 * thresholds are set so it lands on the one or two plates that were built for
 * this moment, and on nothing else.
 */
export function phaseBadge(m: Macros, phase: TrainingPhase): string | null {
  const s = shares(m);
  switch (phase) {
    case 'pre':
    case 'during':
      return s.carbs >= 0.5 && s.fat <= 0.18 && m.fiberG <= 8 ? 'entra liviano' : null;
    case 'post':
      return s.carbs >= 0.45 && s.protein >= 0.25 && s.fat <= 0.22 ? 'repone bien' : null;
    case 'trained':
      return s.protein >= 0.35 ? 'sostiene proteína' : null;
    case 'rest':
      return s.protein >= 0.35 && m.fiberG >= 10 ? 'llena y rinde' : null;
  }
}

// ------------------------------------------------------------------ wording

export interface PhaseCopy {
  title: string;
  detail: string;
  /** The line that heads the meal ideas. */
  tip: string;
}

function agoLabel(min: number): string {
  if (min < 5) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round((min / 60) * 10) / 10;
  return `hace ${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

function inLabel(min: number): string {
  if (min <= 15) return 'en un rato';
  if (min < 90) return `en ${min} min`;
  return `en ${Math.round(min / 60)} h`;
}

const KIND_WORD = { workout: 'Entrenaste', run: 'Corriste' } as const;

export function phaseCopy(ctx: TrainingContext): PhaseCopy {
  switch (ctx.phase) {
    case 'during':
      return {
        title: 'Estás entrenando',
        detail: ctx.sinceMin === null ? 'Sesión abierta' : `Arrancaste ${agoLabel(ctx.sinceMin)}`,
        tip: 'En medio de la sesión: si comés algo que sea líquido y con carbohidrato. Lo sólido esperá al final.',
      };
    case 'post':
      return {
        title: 'Recién entrenaste',
        detail:
          ctx.sinceMin === null
            ? 'Toca reponer'
            : `${KIND_WORD[ctx.kind ?? 'workout']} ${agoLabel(ctx.sinceMin)}`,
        tip: 'Es la comida que más rinde del día: proteína para reparar y carbohidrato para reponer glucógeno. Grasa poca, que frena la digestión.',
      };
    case 'trained':
      return {
        title: 'Ya entrenaste hoy',
        detail:
          ctx.sinceMin === null
            ? 'Sesión hecha'
            : `${KIND_WORD[ctx.kind ?? 'workout']} ${agoLabel(ctx.sinceMin)}`,
        tip: 'El trabajo ya está hecho. Sostené la proteína en lo que queda del día: repartida rinde más que juntada en una comida.',
      };
    case 'pre':
      return {
        title: 'Todavía no entrenaste',
        detail:
          ctx.untilMin === null
            ? ctx.declared
              ? 'Dijiste que hoy entrenás'
              : 'Solés entrenar este día'
            : ctx.expected
              ? `Solés arrancar ${inLabel(ctx.untilMin)}`
              : `Tenés una sesión anotada ${inLabel(ctx.untilMin)}`,
        tip: 'Comés para entrenar después: carbohidrato que se digiera fácil, poca grasa y poca fibra. Un plato pesado se siente en la primera serie.',
      };
    case 'rest':
      return {
        title: ctx.declared ? 'Día de descanso' : 'Sin entrenamiento hoy',
        detail: ctx.declared ? 'Lo marcaste vos' : 'Nada registrado y no es tu día habitual',
        tip: 'Sin sesión que alimentar: la proteína queda igual, el carbohidrato pesa menos y la verdura es lo que hace llevadero el día.',
      };
  }
}
