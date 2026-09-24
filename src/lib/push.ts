/**
 * The rest-over alert that reaches a minimized app.
 *
 * iOS freezes an installed PWA, service worker and all, as soon as it leaves
 * the screen, and offers no way to schedule a notification. A push from a
 * server is the one thing that wakes it. So when a rest starts, the page hands
 * the deadline to a small Cloudflare Worker (`push/` in this repo), and the
 * Worker sends the push at that second.
 *
 * The public key is the pair of the private one set as a Worker secret. They
 * have to match: a subscription made with one key only accepts pushes signed
 * with the other half of it.
 */
const PUSH_URL = 'https://ironlog-push.__WORKERS_SUBDOMAIN__.workers.dev';
const VAPID_PUBLIC_KEY =
  'BNNfMNVTdFkWYIQQBGokkZuIARicQU_aHpl2v3xMoRHk2bPIPuYR7kLTDDVZ8PaZLU_px8_DZ6iCkHGTRCF8GXI';

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * The subscription, made on first use. Null wherever push cannot work: no
 * permission yet, a browser without PushManager, or iOS Safari in a tab rather
 * than installed to the home screen.
 */
async function subscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (!('Notification' in window) || Notification.permission !== 'granted') return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
  });
}

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  const sub = await subscription();
  if (!sub) return false;
  const response = await fetch(`${PUSH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), ...body }),
    // The app is often minimized right after the tap that started the rest;
    // this lets the request finish anyway.
    keepalive: true,
  });
  return response.ok;
}

/** True when the Worker has the deadline and will send the push itself. */
export async function schedulePush(endsAt: number, label?: string): Promise<boolean> {
  try {
    return await post('/schedule', { endsAt, label: label ?? '' });
  } catch {
    return false; // Offline, or the Worker is down. The caller falls back.
  }
}

export async function cancelPush(): Promise<void> {
  try {
    await post('/cancel', {});
  } catch {
    // A push that still arrives after a skipped rest is a nuisance, not harm.
  }
}

/** Called right after permission is granted, so the first rest does not pay for subscribing. */
export async function warmUpPush(): Promise<boolean> {
  try {
    return (await subscription()) !== null;
  } catch {
    return false;
  }
}
