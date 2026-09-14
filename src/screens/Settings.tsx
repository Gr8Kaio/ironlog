import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, updateSettings } from '../db/db';
import type { PlateStock, Surface } from '../db/types';
import { SURFACES } from '../db/types';
import { resetToEmpty, resetToSeed } from '../db/seed';
import {
  daysSinceBackup,
  exportJson,
  exportRunsCsv,
  exportSetsCsv,
  importBackup,
  markBackedUp,
  parseBackup,
  saveFile,
  type ImportMode,
  type ImportReport,
} from '../lib/backup';
import { fmtKg, formatClock } from '../lib/calc';
import { SURFACE_LABEL } from '../lib/labels';
import { requestNotificationPermission } from '../hooks/useRestTimer';
import { PlateMath } from '../components/PlateMath';
import { Stepper } from '../components/Stepper';
import { FuelTargets } from '../components/FuelTargets';
import {
  Button,
  Card,
  Chip,
  ConfirmRow,
  Screen,
  SectionTitle,
  Sheet,
  TopBar,
  cx,
} from '../components/ui';
import { DownloadIcon, PlateIcon, TrashIcon, UploadIcon } from '../components/icons';

type Pending = { filename: string; text: string; mime: string; label: string } | null;

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<Pending>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [confirmReset, setConfirmReset] = useState<'seed' | 'empty' | null>(null);
  const [platesOpen, setPlatesOpen] = useState(false);
  const [notifyState, setNotifyState] = useState<string | null>(null);

  const counts = useLiveQuery(async () => {
    const [workouts, sets, runs, metrics] = await Promise.all([
      db.workouts.count(),
      db.sets.count(),
      db.runs.count(),
      db.bodyMetrics.count(),
    ]);
    return { workouts, sets, runs, metrics };
  }, [], undefined);

  if (!settings) {
    return (
      <Screen>
        <TopBar title="Settings" />
      </Screen>
    );
  }

  const staleDays = daysSinceBackup(settings.lastBackupAt);
  const overdue = staleDays === null || staleDays >= settings.backupNagDays;

  /**
   * Two taps by design: the payload is built here, and the actual share
   * happens on the next tap so iOS still counts it as a user gesture.
   */
  async function prepare(kind: 'json' | 'sets' | 'runs') {
    setStatus(null);
    const built =
      kind === 'json' ? await exportJson() : kind === 'sets' ? await exportSetsCsv() : await exportRunsCsv();
    setPending({
      ...built,
      mime: kind === 'json' ? 'application/json' : 'text/csv',
      label: kind === 'json' ? 'Full backup' : kind === 'sets' ? 'All sets' : 'All runs',
    });
  }

  async function save() {
    if (!pending) return;
    const result = await saveFile(pending.filename, pending.text, pending.mime);
    if (result === 'shared' || result === 'downloaded') {
      if (pending.mime === 'application/json') await markBackedUp();
      setStatus(`${pending.label} saved as ${pending.filename}`);
      setPending(null);
    } else if (result === 'cancelled') {
      setStatus(null);
    } else {
      setStatus('Could not save the file. Copy it instead.');
    }
  }

  async function copy() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.text);
      if (pending.mime === 'application/json') await markBackedUp();
      setStatus(`${pending.label} copied to the clipboard`);
      setPending(null);
    } catch {
      setStatus('The clipboard is not available here.');
    }
  }

  async function runImport(mode: ImportMode) {
    if (!importText) return;
    try {
      const payload = parseBackup(importText);
      const result = await importBackup(payload, mode);
      setReport(result);
      setImportText(null);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  return (
    <Screen>
      <TopBar title="Settings" />

      {/* Backup --------------------------------------------------------- */}
      <SectionTitle>Your data</SectionTitle>
      <Card className={cx('p-3', overdue ? 'border-gold/40' : '')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {staleDays === null
                ? 'Never backed up'
                : staleDays === 0
                  ? 'Backed up today'
                  : `Backed up ${staleDays} day${staleDays === 1 ? '' : 's'} ago`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {counts
                ? `${counts.workouts} sessions · ${counts.sets} sets · ${counts.runs} runs · ${counts.metrics} weigh-ins`
                : ''}
            </p>
          </div>
          {overdue ? <Chip tone="gold">Due</Chip> : <Chip tone="good">Current</Chip>}
        </div>

        <p className="mt-3 text-xs text-faint">
          Everything lives in this browser only. Clearing site data deletes it, so keep a JSON
          backup somewhere you control.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="primary" onClick={() => prepare('json')} className="col-span-3">
            <DownloadIcon className="size-5" /> Export backup (JSON)
          </Button>
          <Button variant="ghost" className="col-span-3 text-sm" onClick={() => fileInput.current?.click()}>
            <UploadIcon className="size-5" /> Import a backup
          </Button>
          <Button variant="outline" className="text-xs" onClick={() => prepare('sets')}>
            Sets CSV
          </Button>
          <Button variant="outline" className="text-xs" onClick={() => prepare('runs')}>
            Runs CSV
          </Button>
          <Button
            variant="outline"
            className="text-xs"
            onClick={() =>
              updateSettings({ backupNagDays: settings.backupNagDays === 7 ? 14 : 7 })
            }
          >
            Remind: {settings.backupNagDays}d
          </Button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setImportError(null);
            setReport(null);
            setImportText(await file.text());
          }}
        />

        {status ? <p className="mt-3 text-xs text-good">{status}</p> : null}
      </Card>

      {/* Fuel targets ---------------------------------------------------- */}
      <FuelTargets />

      {/* Bar and plates ------------------------------------------------- */}
      <SectionTitle>Barbell</SectionTitle>
      <Card className="space-y-3 p-3">
        <Stepper
          label="Bar weight"
          value={settings.barWeightKg}
          onChange={(value) => updateSettings({ barWeightKg: value })}
          step={0.5}
          min={5}
          max={35}
          format={fmtKg}
          suffix="kg"
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Plates on the rack (pairs)
            </span>
            <button
              type="button"
              onClick={() => setPlatesOpen(true)}
              className="flex items-center gap-1 text-[11px] font-medium text-iron"
            >
              <PlateIcon className="size-3.5" /> Preview
            </button>
          </div>
          <PlateInventory
            inventory={settings.plateInventory}
            onChange={(plateInventory) => updateSettings({ plateInventory })}
          />
        </div>
      </Card>

      {/* Session defaults ----------------------------------------------- */}
      <SectionTitle>Defaults</SectionTitle>
      <Card className="space-y-3 p-3">
        <Stepper
          label="Rest timer"
          value={settings.defaultRestSec}
          onChange={(value) => updateSettings({ defaultRestSec: value })}
          step={15}
          min={30}
          max={600}
          format={formatClock}
          suffix="used when an exercise has no target"
        />

        <div>
          <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-faint uppercase">
            Default running surface
          </div>
          <div className="flex gap-1.5">
            {SURFACES.map((surface) => (
              <button
                key={surface}
                type="button"
                onClick={() => updateSettings({ defaultSurface: surface as Surface })}
                className={cx(
                  'min-h-11 flex-1 rounded-lg text-sm font-medium',
                  settings.defaultSurface === surface
                    ? 'bg-stride text-ink'
                    : 'bg-raised text-muted active:bg-line',
                )}
              >
                {SURFACE_LABEL[surface]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => updateSettings({ soundOnRestEnd: !settings.soundOnRestEnd })}
          className="flex w-full items-center gap-3 rounded-xl bg-raised px-3 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Beep when rest ends</span>
            <span className="block text-[11px] text-faint">
              Scheduled audio, the only alert that survives the screen switching off
            </span>
          </span>
          <span
            className={cx(
              'flex h-6 w-10 shrink-0 items-center rounded-full px-0.5 transition-colors',
              settings.soundOnRestEnd ? 'bg-iron' : 'bg-line',
            )}
          >
            <span
              className={cx(
                'size-5 rounded-full bg-white transition-transform',
                settings.soundOnRestEnd ? 'translate-x-4' : '',
              )}
            />
          </span>
        </button>

        <div>
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={async () => {
              const result = await requestNotificationPermission();
              setNotifyState(result);
            }}
          >
            Enable rest notifications
          </Button>
          <p className="mt-1.5 text-[11px] text-faint">
            {notifyState === 'granted'
              ? 'Notifications are on.'
              : notifyState === 'denied'
                ? 'Denied. The beep still fires.'
                : notifyState === 'unsupported'
                  ? 'This browser has no Notification API. The beep still fires.'
                  : 'On iPhone this only works once IronLog is added to the home screen, and never while Safari is in the background. The beep is the reliable alert.'}
          </p>
        </div>
      </Card>

      {/* Danger --------------------------------------------------------- */}
      <SectionTitle>Reset</SectionTitle>
      <Card className="space-y-2 p-3">
        {confirmReset === 'empty' ? (
          <ConfirmRow
            message="Delete every session, run and measurement, keeping only the exercise library and the seeded routine?"
            confirmLabel="Erase all data"
            onConfirm={async () => {
              await resetToEmpty();
              setConfirmReset(null);
            }}
            onCancel={() => setConfirmReset(null)}
          />
        ) : confirmReset === 'seed' ? (
          <ConfirmRow
            message="Replace everything with the demo data? Anything you have logged is deleted."
            confirmLabel="Reload demo data"
            onConfirm={async () => {
              await resetToSeed();
              setConfirmReset(null);
            }}
            onCancel={() => setConfirmReset(null)}
          />
        ) : (
          <>
            <Button variant="ghost" className="w-full text-sm" onClick={() => setConfirmReset('empty')}>
              <TrashIcon className="size-4" /> Clear all logged data
            </Button>
            <Button variant="ghost" className="w-full text-sm" onClick={() => setConfirmReset('seed')}>
              Reload the demo data
            </Button>
          </>
        )}
        <p className="text-center text-[11px] text-faint">Export a backup first.</p>
      </Card>

      <p className="mt-6 text-center text-[11px] text-faint">
        IronLog v{__APP_VERSION__} · offline-first · all data on this device
      </p>

      {/* Export sheet ---------------------------------------------------- */}
      <Sheet open={pending !== null} onClose={() => setPending(null)} title={pending?.label}>
        {pending ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-raised p-3">
              <p className="text-sm font-medium">{pending.filename}</p>
              <p className="tabular mt-0.5 text-xs text-faint">
                {(new Blob([pending.text]).size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button variant="primary" className="w-full" onClick={save}>
              <DownloadIcon className="size-5" /> Save file
            </Button>
            <Button variant="ghost" className="w-full text-sm" onClick={copy}>
              Copy to clipboard
            </Button>
            <p className="text-[11px] text-faint">
              On iPhone, Save opens the share sheet — choose Save to Files, or send it to yourself.
            </p>
          </div>
        ) : null}
      </Sheet>

      {/* Import sheet ---------------------------------------------------- */}
      <Sheet
        open={importText !== null || report !== null}
        onClose={() => {
          setImportText(null);
          setReport(null);
          setImportError(null);
        }}
        title={report ? 'Import complete' : 'Import backup'}
      >
        {report ? (
          <div className="space-y-2 text-sm">
            <p className="text-good">
              Imported in {report.mode} mode. Personal records were recomputed from the sets.
            </p>
            <div className="rounded-xl bg-raised p-3 text-xs">
              {Object.entries(report.added).map(([table, added]) => (
                <div key={table} className="flex justify-between gap-3 py-0.5">
                  <span className="text-muted">{table}</span>
                  <span className="tabular">
                    +{added}
                    {report.skipped[table] ? (
                      <span className="text-faint"> · {report.skipped[table]} already present</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            {report.warnings.map((warning) => (
              <p key={warning} className="text-xs text-gold">
                {warning}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {importError ? (
              <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                {importError}
              </p>
            ) : null}
            <p className="text-sm text-muted">
              Merge keeps what is already here and adds only rows it has not seen, so importing the
              same file twice changes nothing. Replace wipes this device first.
            </p>
            <Button variant="primary" className="w-full" onClick={() => runImport('merge')}>
              Merge into this device
            </Button>
            <Button variant="danger" className="w-full" onClick={() => runImport('replace')}>
              Replace everything
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={platesOpen} onClose={() => setPlatesOpen(false)} title="Plate math preview">
        <PlateMath targetKg={settings.barWeightKg + 80} />
      </Sheet>
    </Screen>
  );
}

/** The rack is a setting, so the helper can say when a target is not loadable. */
function PlateInventory({
  inventory,
  onChange,
}: {
  inventory: PlateStock[];
  onChange: (inventory: PlateStock[]) => void;
}) {
  const sorted = [...inventory].sort((a, b) => b.weightKg - a.weightKg);

  return (
    <div className="space-y-1.5">
      {sorted.map((plate) => (
        <div key={plate.weightKg} className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5">
          <span className="tabular w-14 text-sm font-medium">{fmtKg(plate.weightKg)} kg</span>
          <div className="flex flex-1 justify-end gap-1">
            {[0, 1, 2, 3, 4].map((pairs) => (
              <button
                key={pairs}
                type="button"
                onClick={() =>
                  onChange(
                    sorted.map((p) => (p.weightKg === plate.weightKg ? { ...p, pairs } : p)),
                  )
                }
                className={cx(
                  'tabular size-9 rounded-lg text-sm font-semibold',
                  plate.pairs === pairs ? 'bg-iron text-ink' : 'text-muted active:bg-line',
                )}
              >
                {pairs}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
