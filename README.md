# IronLog

An offline-first gym and running tracker. Single user, no backend, no login.
Everything is stored in IndexedDB on the device and never leaves it.

- **Lifting** — session logging that starts each set at the weight and reps you
  last actually used, a rest timer, automatic PR detection, and a barbell
  plate-math helper.
- **Bodyweight work** — pull-ups and dips read as `Bodyweight` rather than
  `0 kg`, and count for their real load using your latest weigh-in.
- **Running** — first-class, with interval splits, pace trends split by run
  type, and weekly and monthly distance.
- **Body** — weigh-ins with measurements, charted on their own Progress tab
  with a smoothed trend line and a per-week rate of change.
- **Fuel** — food logging against a rolling weekly calorie budget, with meal
  ideas that read what you trained today.
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

Rest-timer alerts on iOS:

1. A **push notification** from the rest-timer Worker (`push/`), sent at the
   second the rest ends. iOS freezes a minimized PWA whole (page and service
   worker timers alike) and has no scheduled notifications, so a push from
   outside is the only thing that reaches it. Needs the app installed to the
   home screen (iOS 16.4+) and **Enable rest notifications** tapped once in
   Settings, which also subscribes to push.
2. A WebAudio beep scheduled at an exact context time — it survives the screen
   switching off mid-rest.
3. A screen wake lock held while resting, which keeps the app foregrounded.

The push is the only source of the banner. If it cannot be scheduled
(offline, no permission), the service worker keeps a local timer instead,
which fires only while the browser keeps it alive, and stays quiet if the app
is already on screen. There is no vibration on iOS.

### The push Worker

`push/` is a Cloudflare Worker with one Durable Object per push subscription;
the object's alarm is the timer. Web Push (VAPID + `aes128gcm`) is done by
hand on WebCrypto in `push/src/webpush.js`, checked against an independent
Node decrypt by `node scripts/check-push.mjs`.

```sh
cd push
npx wrangler login
npx wrangler secret put VAPID_PRIVATE_JWK   # the private key, as a JWK
npx wrangler deploy
```

The public half of the VAPID key is in `push/wrangler.toml` and
`src/lib/push.ts`, and the two must match the secret. Changing the key
invalidates every existing subscription; the app resubscribes on its own.

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

## Fuel

Food logging built around a weekly budget rather than a daily cap. Body fat
answers to the weekly energy balance, so one big Sunday lunch is a budgeting
question, not a failed day: today's allowance is the week's remainder spread
over the days still to come, and `planBigDay()` settles the number *before* the
asado instead of after it.

The day is split across four meals by a configurable share, and the split
rebalances as you eat — overshooting lunch shrinks dinner rather than quietly
blowing the day.

### Training-aware meal ideas

The one thing a general-purpose tracker cannot do: IronLog already knows when
you lifted and when you ran, so Fuel reads it. `src/lib/trainingFuel.ts` places
the day in one of five phases — `pre`, `during`, `post`, `trained`, `rest` —
from the sessions logged for today, falling back to how reliably that weekday
has been a training day over the last six weeks.

The phase does two things:

- **Tilts the meal's macro target.** Same calories, protein untouched; what
  moves is the energy after protein, towards carbohydrate before and after a
  session and away from it on a rest day. It pays for itself — each later meal
  gets what the daily target has left, so a carb-heavy lunch leaves dinner with
  less and the day still lands where it should.
- **Reorders the plates**, with a smaller timing penalty on top of the calorie
  fit. It breaks ties between plates that already fit; it will not hand you a
  plate of the wrong size because the timing flatters it.

Three things it refuses to do, all of which would produce confident nonsense:

- Guess a phase for a day that is already over. A past day is read from its own
  logs only.
- Treat a session logged for later today as one you have recovered from. Until
  the clock reaches it, it is a plan.
- Call a Tuesday pre-workout at eleven at night because Tuesdays are usually
  leg day. Two hours past the usual start, the session did not happen.

The read is right most days and wrong on exactly the days you care about, so
the card on the Fuel screen is a button: **Voy a entrenar · Ya entrené ·
Descanso** overrides it. The choice is per day and lives in `localStorage` —
it is a note about one day, it never needs to reach another device, and it has
no business in a backup.

## Backups

This is the part with no safety net: clearing the browser's site data deletes
everything. Settings tracks the days since your last export and nags after a
configurable interval.

- **JSON backup** — the whole database, restorable, weigh-in photos included
  (as data URLs, about 150 KB each).
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

Two scripts read a real export instead of fixtures, for the calls that are
judgement rather than arithmetic — what the week does with days you did not
log, and how the meal ideas rank against what you actually eat:

```
node --experimental-strip-types scripts/verify-week.ts  <backup.json> [today]
node --experimental-strip-types scripts/verify-ideas.ts <backup.json> [meal]
```
