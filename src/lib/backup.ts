import { db, DEFAULT_SETTINGS, getSettings, updateSettings } from '../db/db';
import type {
  BodyMetric,
  DayIntakeOverride,
  Exercise,
  Food,
  FoodLog,
  PersonalRecord,
  Routine,
  RoutineDay,
  RoutineExercise,
  Run,
  RunInterval,
  Settings,
  WaterLog,
  Workout,
  WorkoutSet,
} from '../db/types';
import { recomputeAllPrs } from './prs';
import { seedFoodsIfMissing } from '../db/seedFoods';
import { epley1RM, paceSecPerKm, setLoad } from './calc';
import { todayLocalDate } from './dates';
import { photosToRecords, recordToPhoto, type BodyPhotoRecord } from './photos';

/**
 * 2 added the fuel tables, 3 the water log, 4 the rulings on days you did not
 * log, 5 the weigh-in photos (as data URLs, since JSON has no bytes). An older
 * file still imports (older is always readable); a newer one refuses to import
 * into a build that predates it, which is the point — it would silently drop
 * what it cannot represent.
 */
export const BACKUP_VERSION = 5;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  app: 'ironlog';
  settings: Settings;
  exercises: Exercise[];
  routines: Routine[];
  routineDays: RoutineDay[];
  routineExercises: RoutineExercise[];
  workouts: Workout[];
  sets: WorkoutSet[];
  runs: Run[];
  runIntervals: RunInterval[];
  bodyMetrics: BodyMetric[];
  bodyPhotos: BodyPhotoRecord[];
  personalRecords: PersonalRecord[];
  foods: Food[];
  foodLogs: FoodLog[];
  waterLogs: WaterLog[];
  dayOverrides: DayIntakeOverride[];
}

export async function buildBackup(): Promise<BackupPayload> {
  const [
    settings,
    exercises,
    routines,
    routineDays,
    routineExercises,
    workouts,
    sets,
    runs,
    runIntervals,
    bodyMetrics,
    bodyPhotos,
    personalRecords,
    foods,
    foodLogs,
    waterLogs,
    dayOverrides,
  ] = await Promise.all([
    getSettings(),
    db.exercises.toArray(),
    db.routines.toArray(),
    db.routineDays.toArray(),
    db.routineExercises.toArray(),
    db.workouts.toArray(),
    db.sets.toArray(),
    db.runs.toArray(),
    db.runIntervals.toArray(),
    db.bodyMetrics.toArray(),
    db.bodyPhotos.toArray().then(photosToRecords),
    db.personalRecords.toArray(),
    db.foods.toArray(),
    db.foodLogs.toArray(),
    db.waterLogs.toArray(),
    db.dayOverrides.toArray(),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'ironlog',
    settings,
    exercises,
    routines,
    routineDays,
    routineExercises,
    workouts,
    sets,
    runs,
    runIntervals,
    bodyMetrics,
    bodyPhotos,
    personalRecords,
    foods,
    foodLogs,
    waterLogs,
    dayOverrides,
  };
}

export async function exportJson(): Promise<{ filename: string; text: string }> {
  const payload = await buildBackup();
  return {
    filename: `ironlog-backup-${todayLocalDate()}.json`,
    text: JSON.stringify(payload, null, 2),
  };
}

// ---------------------------------------------------------------- importing

export type ImportMode = 'merge' | 'replace';

export interface ImportReport {
  mode: ImportMode;
  added: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
}

/** Tables in dependency order, so a partial failure leaves parents before children. */
const TABLES = [
  'exercises',
  'routines',
  'routineDays',
  'routineExercises',
  'workouts',
  'sets',
  'runs',
  'runIntervals',
  'bodyMetrics',
  'bodyPhotos',
  'foods',
  'foodLogs',
  'waterLogs',
  'dayOverrides',
] as const;

/**
 * Which field is a table's primary key. Everything is keyed by `id` except the
 * day rulings, which are keyed by the day: there is only ever one per date, so
 * re-importing a file updates the ruling instead of duplicating it.
 */
const PRIMARY_KEY: Partial<Record<(typeof TABLES)[number], string>> = {
  dayOverrides: 'localDate',
};

export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (typeof raw !== 'object' || raw === null) throw new Error('That file is not an IronLog backup.');
  const payload = raw as Partial<BackupPayload>;

  if (payload.app !== 'ironlog' && !Array.isArray(payload.exercises)) {
    throw new Error('That file is not an IronLog backup.');
  }
  if (typeof payload.version === 'number' && payload.version > BACKUP_VERSION) {
    throw new Error(
      `That backup is version ${payload.version}, newer than this app understands (${BACKUP_VERSION}).`,
    );
  }
  return payload as BackupPayload;
}

/**
 * Merge skips rows whose id already exists, so importing the same file twice
 * is a no-op rather than a duplicate history. Replace wipes first.
 *
 * Replace only wipes the tables the file actually carries. A backup written
 * before a feature existed has no opinion about that feature's data, and
 * clearing it would destroy rows the file cannot put back — importing a v1
 * export used to empty the whole food library and restore nothing.
 *
 * PRs are always recomputed from the imported sets rather than trusted from
 * the file: a hand-edited or partial backup must not be able to leave a record
 * that no set supports.
 */
export async function importBackup(
  payload: BackupPayload,
  mode: ImportMode,
): Promise<ImportReport> {
  const report: ImportReport = { mode, added: {}, skipped: {}, warnings: [] };

  const present = TABLES.filter((name) => Array.isArray(payload[name]));
  const absent = TABLES.filter((name) => !Array.isArray(payload[name]));

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const name of present) await db.table(name).clear();
      if (absent.length > 0) {
        report.warnings.push(
          `This backup does not include ${absent.join(', ')}, so what you already had there was kept.`,
        );
      }
    }

    for (const name of present) {
      let rows = payload[name] as unknown as Record<string, unknown>[];
      // Photos travel as data URLs; the table holds the bytes as a Blob.
      if (name === 'bodyPhotos') {
        rows = (rows as unknown as BodyPhotoRecord[])
          .filter((row) => row && typeof row.dataUrl === 'string')
          .map((row) => recordToPhoto(row) as unknown as Record<string, unknown>);
      }
      const table = db.table(name);
      const key = PRIMARY_KEY[name] ?? 'id';
      const valid = rows.filter((row) => row && typeof row[key] === 'string');
      if (valid.length !== rows.length) {
        report.warnings.push(
          `${rows.length - valid.length} rows in ${name} had no ${key} and were dropped.`,
        );
      }

      if (mode === 'replace') {
        await table.bulkPut(valid);
        report.added[name] = valid.length;
        continue;
      }

      const existing = new Set((await table.toCollection().primaryKeys()) as string[]);
      const fresh = valid.filter((row) => !existing.has(row[key] as string));
      await table.bulkPut(fresh);
      report.added[name] = fresh.length;
      report.skipped[name] = valid.length - fresh.length;
    }

    if (payload.settings) {
      // Current values win over the defaults for anything the file does not
      // mention. An older export has no `kcalTarget` field at all, and falling
      // back to the default would silently clear a target you had set.
      const current = await getSettings();
      await db.settings.put({
        ...DEFAULT_SETTINGS,
        ...current,
        ...payload.settings,
        id: 'settings',
      });
    }
  });

  // Outside the transaction, and after it: an import that arrived without a
  // food library leaves the shipped one to be put back.
  await seedFoodsIfMissing();
  await recomputeAllPrs();
  return report;
}

// ------------------------------------------------------------------ CSV

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

export async function exportSetsCsv(): Promise<{ filename: string; text: string }> {
  const [sets, workouts, exercises] = await Promise.all([
    db.sets.orderBy('completedAt').toArray(),
    db.workouts.toArray(),
    db.exercises.toArray(),
  ]);
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  const rows = sets.map((set) => {
    const workout = workoutById.get(set.workoutId);
    const exercise = exerciseById.get(set.exerciseId);
    return [
      workout?.localDate ?? '',
      workout?.name ?? '',
      exercise?.name ?? '',
      exercise?.muscleGroup ?? '',
      exercise?.equipment ?? '',
      set.setNumber,
      set.setType,
      set.weightKg,
      set.bodyWeightKg ?? '',
      setLoad(set),
      set.reps,
      set.rpe ?? '',
      setLoad(set) * set.reps,
      epley1RM(setLoad(set), set.reps)?.toFixed(1) ?? '',
      (set.prTypes ?? []).join(' '),
      set.note ?? '',
      new Date(set.completedAt).toISOString(),
      set.workoutId,
      set.id,
    ];
  });

  return {
    filename: `ironlog-sets-${todayLocalDate()}.csv`,
    text: toCsv(
      [
        'date',
        'session',
        'exercise',
        'muscle_group',
        'equipment',
        'set_number',
        'set_type',
        'weight_kg',
        'body_weight_kg',
        'load_kg',
        'reps',
        'rpe',
        'volume_kg',
        'est_1rm_kg',
        'prs',
        'note',
        'completed_at',
        'workout_id',
        'set_id',
      ],
      rows,
    ),
  };
}

/**
 * One row per run, followed by one row per interval rep. The `record_type`
 * column keeps the two shapes apart so a spreadsheet filter can isolate either.
 */
export async function exportRunsCsv(): Promise<{ filename: string; text: string }> {
  const [runs, intervals] = await Promise.all([
    db.runs.orderBy('startedAt').toArray(),
    db.runIntervals.toArray(),
  ]);
  const byRun = new Map<string, RunInterval[]>();
  for (const interval of intervals) {
    const list = byRun.get(interval.runId) ?? [];
    list.push(interval);
    byRun.set(interval.runId, list);
  }

  const rows: unknown[][] = [];
  for (const run of runs) {
    const pace = paceSecPerKm(run.distanceKm, run.durationSec);
    rows.push([
      'run',
      run.localDate,
      run.runType,
      run.distanceKm,
      run.durationSec,
      pace ? pace.toFixed(1) : '',
      formatPaceForCsv(pace),
      run.effort ?? '',
      run.kneeFeel ?? '',
      run.surface ?? '',
      run.tempC ?? '',
      run.weather ?? '',
      run.route ?? '',
      run.notes ?? '',
      '',
      '',
      run.id,
    ]);

    for (const rep of (byRun.get(run.id) ?? []).sort((a, b) => a.repNumber - b.repNumber)) {
      const split = paceSecPerKm(rep.distanceM / 1000, rep.durationSec);
      rows.push([
        'interval',
        run.localDate,
        run.runType,
        rep.distanceM / 1000,
        rep.durationSec,
        split ? split.toFixed(1) : '',
        formatPaceForCsv(split),
        '',
        '',
        '',
        '',
        '',
        '',
        rep.note ?? '',
        rep.repNumber,
        rep.restSec ?? '',
        run.id,
      ]);
    }
  }

  return {
    filename: `ironlog-runs-${todayLocalDate()}.csv`,
    text: toCsv(
      [
        'record_type',
        'date',
        'run_type',
        'distance_km',
        'duration_sec',
        'pace_sec_per_km',
        'pace',
        'effort',
        'knee',
        'surface',
        'temp_c',
        'weather',
        'route',
        'notes',
        'rep_number',
        'rest_sec',
        'run_id',
      ],
      rows,
    ),
  };
}

function formatPaceForCsv(secPerKm: number | null): string {
  if (secPerKm === null) return '';
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ saving

export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'unsupported';

/**
 * Saving a file on iOS Safari means the share sheet, since a download link is
 * inert there. Must be called straight from a tap: building the payload first
 * and sharing on a later tap keeps the gesture fresh.
 */
export async function saveFile(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<SaveResult> {
  const file = new File([text], filename, { type: mime });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (error) {
      // AbortError is the user dismissing the sheet, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'unsupported';
  }
}

export async function markBackedUp(): Promise<void> {
  await updateSettings({ lastBackupAt: Date.now() });
}

/** Days since the last export, or null if there has never been one. */
export function daysSinceBackup(lastBackupAt: number | null | undefined): number | null {
  if (!lastBackupAt) return null;
  return Math.floor((Date.now() - lastBackupAt) / 86_400_000);
}
