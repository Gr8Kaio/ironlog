/**
 * Every "what day was that" question in the app goes through here.
 *
 * Sessions are stored with both an epoch ms (`startedAt`) and a `localDate`
 * string. Ordering uses the number; grouping uses the string. Deriving the day
 * from epoch ms at read time would silently reshuffle a 23:40 session into the
 * next week whenever the reader's offset differs from the writer's.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the *local* calendar, never UTC. */
export function localDateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocalDate(): string {
  return localDateOf(Date.now());
}

/** Local midnight of a `YYYY-MM-DD` string. */
export function parseLocalDate(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Combine a `YYYY-MM-DD` and a `HH:MM` into epoch ms, local. */
export function toEpoch(localDate: string, time = '12:00'): number {
  const [h, min] = time.split(':').map(Number);
  const d = parseLocalDate(localDate);
  d.setHours(h || 0, min || 0, 0, 0);
  return d.getTime();
}

/** Monday-of-week as `YYYY-MM-DD`. Sorts lexicographically, so it doubles as a key. */
export function weekStart(localDate: string): string {
  const d = parseLocalDate(localDate);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return localDateOf(d.getTime());
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const d = parseLocalDate(localDate);
  d.setDate(d.getDate() + days);
  return localDateOf(d.getTime());
}

/** `YYYY-MM` */
export function monthKey(localDate: string): string {
  return localDate.slice(0, 7);
}

/** The last `count` week-start keys, oldest first, ending with the current week. */
export function recentWeeks(count: number, from = todayLocalDate()): string[] {
  const current = weekStart(from);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDaysToLocalDate(current, -7 * i));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `Mon 12 Aug` */
export function formatDate(localDate: string): string {
  const d = parseLocalDate(localDate);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** `12 Aug` */
export function formatDateShort(localDate: string): string {
  const d = parseLocalDate(localDate);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** `18:42` */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Today" / "Yesterday" / "Mon 12 Aug" */
export function formatDayLabel(localDate: string): string {
  const today = todayLocalDate();
  if (localDate === today) return 'Today';
  if (localDate === addDaysToLocalDate(today, -1)) return 'Yesterday';
  return formatDate(localDate);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** "3 days ago", "today", "in 2 days" */
export function relativeDays(localDate: string, from = todayLocalDate()): string {
  const diff = daysBetween(localDate, from);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1) return `${diff} days ago`;
  if (diff === -1) return 'tomorrow';
  return `in ${-diff} days`;
}
