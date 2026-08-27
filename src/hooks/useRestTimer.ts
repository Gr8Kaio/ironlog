import { useCallback, useEffect, useRef, useState } from 'react';

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
 * timers in a backgrounded tab. So the alert is layered, cheapest first:
 *
 *   1. WebAudio beep scheduled at an exact context time - the only alert that
 *      survives the screen switching off mid-rest.
 *   2. A screen wake lock while resting, which keeps the app foregrounded and
 *      is what makes 1 and 3 fire on time.
 *   3. A Notification when permission exists, plus vibration where supported
 *      (never on iOS, which has no Vibration API).
 *
 * On returning to a tab that was frozen past the end, the effect fires the
 * alert immediately rather than silently swallowing it.
 */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSec, setTotalSec] = useState(0);
  const [label, setLabel] = useState<string | undefined>();
  const [remaining, setRemaining] = useState(0);

  const audioRef = useRef<AudioContext | null>(null);
  const scheduled = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
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
    releaseWakeLock();
    localStorage.removeItem(STORAGE_KEY);
    setEndsAt(null);
    setRemaining(0);
    setLabel(undefined);
  }, [clearScheduledAudio, releaseWakeLock]);

  const alertNow = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    navigator.vibrate?.([200, 100, 200]);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Rest over', { body: label ?? 'Next set', tag: 'ironlog-rest' });
      } catch {
        // Some browsers only allow this from a service worker; the beep covers it.
      }
    }
  }, [label]);

  /**
   * Schedules three beeps at an exact AudioContext time. Doing this up front
   * rather than on a timer callback is what lets the alert survive the tab
   * being frozen: the audio graph is already committed.
   */
  const scheduleBeep = useCallback((seconds: number, enabled: boolean) => {
    if (!enabled) return;
    audioRef.current ??= new AudioContext();
    const ctx = audioRef.current;
    // Starting the timer is a user gesture, so this is the moment the context
    // can legally be unlocked.
    void ctx.resume().catch(() => {});

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
  }, []);

  const start = useCallback(
    (seconds: number, options?: { label?: string; sound?: boolean }) => {
      clearScheduledAudio();
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
      navigator.wakeLock
        ?.request('screen')
        .then((lock) => {
          wakeLock.current = lock;
        })
        .catch(() => {
          // Denied or unsupported. The timer still runs, the screen may sleep.
        });
    },
    [clearScheduledAudio, scheduleBeep],
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
