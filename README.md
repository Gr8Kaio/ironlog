# IronLog

An offline-first gym and running tracker. Single user, no backend, no login.
Everything is stored in IndexedDB on the device and never leaves it.

- **Lifting** — session logging with per-set prefill from last time, a rest
  timer, automatic PR detection, and a barbell plate-math helper.
- **Running** — first-class, with interval splits, pace trends split by run
  type, and weekly and monthly distance.
- **One timeline** — lifts and runs share a colour-coded history, so a week
  reads at a glance.
- **Your data** — JSON backup and restore, CSV export of every set and every
  run.

Built for one-handed use on a phone mid-set: large touch targets, +/- steppers
instead of typing, dark theme, kg and km.

## Running it

Node 20+ required.

```bash
npm install
npm run dev        # http://localhost:5173/ironlog/
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built app (needed to exercise the service worker) |
| `npm run check` | Assertions over the plate solver, pace, Epley and week bucketing |
| `npm run lint` | oxlint |

The service worker is disabled in dev. To test offline behaviour, use
`npm run build && npm run preview`, load the page once, then go offline.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Enable it once under **Settings → Pages →
Source → GitHub Actions**.

The app is served from a subpath, so `base` in `vite.config.ts` must match the
repository name:

```ts
const BASE = '/ironlog/';
```

For Vercel or any root-domain host, set `BASE = '/'` and rebuild. Routing uses
`HashRouter` because GitHub Pages cannot rewrite deep links to `index.html`.

## Installing on the phone

Open the deployed URL in Safari, then **Share → Add to Home Screen**. It then
launches standalone and works with no connection.

Rest-timer alerts on iOS, in order of reliability:

1. A WebAudio beep scheduled at an exact context time — the only alert that
   survives the screen switching off mid-rest.
2. A screen wake lock held while resting, which keeps the app foregrounded.
3. A Notification, but only once installed to the home screen (iOS 16.4+), and
   never while Safari is backgrounded. Enable it in Settings if you want it.

The beep is the one to rely on. There is no vibration on iOS.

## Data model

Twelve IndexedDB stores, keyed by UUID so an import can merge into a database
that already has rows without colliding.

```
routines ──< routineDays ──< routineExercises >── exercises
                  │                                   │
workouts >────────┘                                   │
   └──< sets >─────────────────────────────────────────┤
   personalRecords >───────────────────────────────────┘

runs ──< runIntervals          bodyMetrics          settings
```

Two conventions carry most of the weight:

- **Every session stores both an epoch timestamp and a local `YYYY-MM-DD`.**
  Ordering uses the number, calendar grouping uses the string. Deriving the day
  from the timestamp at read time would shuffle a 23:40 session into the wrong
  week whenever the reader's UTC offset differs from the writer's.
- **Nothing derived is stored.** Pace, estimated 1RM, volume and weekly totals
  are computed on read, so an edited set can never leave a stale number behind.
  The single exception is `personalRecords`, a deliberate cache so the PR badge
  does not rescan your history mid-set — and it is recomputed per exercise
  whenever a set changes, and wholesale after any import.

Workouts and runs are separate stores merged at read time by `getHistory()` in
`src/db/queries.ts`. A single table with a `type` column would leave most
columns null for whichever kind you were looking at; at single-user volumes,
merging two date-sorted arrays costs nothing.

### Estimated 1RM

Epley — `weight × (1 + reps/30)` — capped at 12 reps. Above that the formula
stops describing anything real, so the app shows nothing rather than a
confident fiction. A session of only high-rep sets is absent from the e1RM
chart instead of being plotted as zero.

### PRs

Three kinds, all detected automatically: heaviest working set, best estimated
1RM from a single set, and most working volume for one exercise within a
session. A record must be *strictly* greater than everything logged before it,
so repeating your best does not re-award it.

## Backups

This is the part with no safety net: clearing the browser's site data deletes
everything. Settings tracks the days since your last export and nags after a
configurable interval.

- **JSON backup** — the whole database, restorable.
- **Import: merge** — skips rows whose id already exists, so importing the same
  file twice changes nothing. Use it to fold one device into another.
- **Import: replace** — wipes this device first.
- **CSV** — `ironlog-sets-*.csv` is one row per set with exercise name, volume
  and estimated 1RM; `ironlog-runs-*.csv` is one row per run plus one per
  interval rep, with pace, distinguished by a `record_type` column.

PRs are always recomputed from the imported sets rather than trusted from the
file, so a hand-edited backup cannot leave a record that no set supports.

On iPhone, saving a file means the share sheet — choose Save to Files. The
export builds the file on the first tap and shares on the second, so the user
gesture is still live when the share fires.

## Seed data

A fresh install seeds ~60 exercises, a 5-day upper/lower routine, and five
weeks of demo sessions, runs and weigh-ins, so every screen has something in it
before anything real is logged. The demo history comes from a fixed PRNG seed,
so it is identical on every device.

Settings → Reset offers **Clear all logged data** (keeps the library and
routine) and **Reload the demo data**.

Seeded exercises use stable slug ids (`seed-bench-press`) rather than random
UUIDs, so two devices seeded independently agree on what "Back Squat" is and an
export from one merges cleanly into the other.

## Layout

```
src/
  db/        types, Dexie schema, seed data, all queries
  lib/       pure logic: calc, dates, plates, PRs, backup, labels
  hooks/     rest timer
  components/ shared UI, stepper, charts, pickers
  screens/   one file per route
scripts/     math assertions, icon generation
```

`src/lib/` has no React and no database imports beyond types, which is why
`npm run check` can exercise it directly under Node's type stripping with no
test framework.
