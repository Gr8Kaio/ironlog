import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelPush, schedulePush } from '../lib/push';

const STORAGE_KEY = 'ironlog.restTimer';

interface StoredTimer {
  endsAt: number;
  totalSec: number;
  label?: string;
}

/**
 * Rest timer.
 *
 * The countdown is derived from an absolute `endsAt` rather than decremented
 * on a tick, so a backgrounded tab, a locked phone or a reload all resume at
 * the correct remaining time instead of pausing.
 *
 * Alerting on iOS is the awkward part. Safari only delivers Notifications for
 * a PWA installed to the home screen (16.4+), never for a tab, and it freezes
 * a minimized app whole - page timers and service-worker timers alike. There
 * is no scheduled-notification API. So:
 *
 *   1. The banner comes from a server push (`lib/push.ts`): the deadline goes
 *      to a Worker when the rest starts and the push arrives at that second,
 *      which wakes a frozen app when nothing inside it can. It is the only
 *      source of the banner. Showing one from the page as well is what made
 *      two of them turn up on reopening the app.
 *   2. Only if the push cannot be scheduled (offline, no permission, a tab
 *      rather than the installed app) does the service worker get the deadline
 *      and raise the banner itself, for as long as the browser keeps it alive.
 *   3. WebAudio beeps scheduled at an exact context time, plus a near-silent
 *      tone that keeps the audio session alive in the background. That is the
 *      alert with the screen off, and it needs no code to run when it sounds.
 *   4. The page, on its own tick and on becoming visible, vibrates and marks
 *      the rest done. It never raises a banner: when it runs, you are looking
 *      at it.
 */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSec, setTotalSec] = useState(0);
  const [label, setLabel] = useState<string | undefined>();
  const [remaining, setRemaining] = useState(0);

  const audioRef = useRef<AudioContext | null>(null);
  const scheduled = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
  const keepAlive = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const fired = useRef(false);

  // Restore a timer that was running when the app was closed or reloaded.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredTimer;
      if (stored.endsAt > Date.now()) {
        setEndsAt(stored.endsAt);
        setTotalSec(stored.totalSec);
        setLabel(stored.label);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  /**
   * Holds the audio session open for the length of the rest.
   *
   * A context with nothing playing is suspended the moment iOS backgrounds the
   * app, and a suspended context does not sound the beeps already scheduled in
   * it. A tone this quiet is inaudible on any device and is enough to keep the
   * session live. It stops as soon as the rest ends, so nothing is held open
   * between sets.
   */
  const startKeepAlive = useCallback((ctx: AudioContext, seconds: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 60;
    gain.gain.value = 0.0008;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    // A hard stop a beat after the last beep, so a timer left running cannot
    // hold the audio session open for the rest of the day.
    osc.stop(ctx.currentTime + seconds + 2);
    keepAlive.current = { osc, gain };
  }, []);

  const stopKeepAlive = useCallback(() => {
    const node = keepAlive.current;
    keepAlive.current = null;
    if (!node) return;
    try {
      node.osc.stop();
      node.osc.disconnect();
      node.gain.disconnect();
    } catch {
      // Already stopped by its own scheduled stop time.
    }
  }, []);

  /** The fallback: hands the service worker the deadline when no push could be scheduled. */
  const tellWorker = useCallback((message: Record<string, unknown>) => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: 'ironlog-rest', ...message }))
      .catch(() => {
        // No worker here, or it is still installing. The beep covers it.
      });
  }, []);

  const clearScheduledAudio = useCallback(() => {
    for (const node of scheduled.current) {
      try {
        node.osc.stop();
        node.osc.disconnect();
        node.gain.disconnect();
      } catch {
        // Already stopped; nothing to unwind.
      }
    }
    scheduled.current = [];
  }, []);

  const stop = useCallback(() => {
    clearScheduledAudio();
    stopKeepAlive();
    releaseWakeLock();
    tellWorker({ action: 'cancel' });
    void cancelPush();
    localStorage.removeItem(STORAGE_KEY);
    setEndsAt(null);
    setRemaining(0);
    setLabel(undefined);
  }, [clearScheduledAudio, stopKeepAlive, releaseWakeLock, tellWorker]);

  const alertNow = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    stopKeepAlive();
    navigator.vibrate?.([200, 100, 200]);
  }, [stopKeepAlive]);

  /**
   * Schedules three beeps at an exact AudioContext time. Doing this up front
   * rather than on a timer callback is what lets the alert survive the tab
   * being frozen: the audio graph is already committed.
   */
  const scheduleBeep = useCallback(
    (seconds: number, enabled: boolean) => {
      if (!enabled) return;
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      // Starting the timer is a user gesture, so this is the moment the context
      // can legally be unlocked.
      void ctx.resume().catch(() => {});
      startKeepAlive(ctx, seconds);

      const at = ctx.currentTime + seconds;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = at + i * 0.28;
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1180 : 880;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.45, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
        scheduled.current.push({ osc, gain });
      }
    },
    [startKeepAlive],
  );

  const start = useCallback(
    (seconds: number, options?: { label?: string; sound?: boolean }) => {
      clearScheduledAudio();
      stopKeepAlive();
      fired.current = false;
      const ends = Date.now() + seconds * 1000;
      setEndsAt(ends);
      setTotalSec(seconds);
      setLabel(options?.label);
      setRemaining(seconds);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ endsAt: ends, totalSec: seconds, label: options?.label }),
      );
      scheduleBeep(seconds, options?.sound !== false);
      // One source for the banner, never two. A rescheduled rest (+30 s)
      // overwrites the earlier push on the server side.
      tellWorker({ action: 'cancel' });
      void schedulePush(ends, options?.label).then((scheduled) => {
        if (!scheduled) tellWorker({ action: 'schedule', endsAt: ends, label: options?.label });
      });
      navigator.wakeLock
        ?.request('screen')
        .then((lock) => {
          wakeLock.current = lock;
        })
        .catch(() => {
          // Denied or unsupported. The timer still runs, the screen may sleep.
        });
    },
    [clearScheduledAudio, stopKeepAlive, scheduleBeep, tellWorker],
  );

  /** Add or remove time without losing the beep already scheduled. */
  const adjust = useCallback(
    (deltaSec: number) => {
      if (endsAt === null) return;
      const nextRemaining = Math.max(5, Math.round((endsAt - Date.now()) / 1000) + deltaSec);
      start(nextRemaining, { label });
    },
    [endsAt, label, start],
  );

  // Tick. 250ms is smooth enough for a seconds display without burning battery.
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        alertNow();
        releaseWakeLock();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, alertNow, releaseWakeLock]);

  // Coming back to a frozen tab: fire late rather than not at all, and take
  // the wake lock again since it is dropped whenever the page is hidden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || endsAt === null) return;
      if (Date.now() >= endsAt) {
        alertNow();
      } else if (!wakeLock.current) {
        navigator.wakeLock
          ?.request('screen')
          .then((lock) => {
            wakeLock.current = lock;
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [endsAt, alertNow]);

  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  return {
    running: endsAt !== null,
    remaining,
    totalSec,
    label,
    done: endsAt !== null && remaining === 0,
    start,
    stop,
    adjust,
  };
}

/** Asked for once, from a tap. Denied is fine: the beep is the real alert. */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
