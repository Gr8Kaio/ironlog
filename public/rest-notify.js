/*
 * Rest-timer alerts, fired from inside the service worker.
 *
 * Imported into the generated Workbox worker via `workbox.importScripts` in
 * vite.config.ts, which is the only hook a `generateSW` build offers.
 *
 * Why it exists: `new Notification()` from the page cannot fire while the page
 * is frozen, which is exactly the case this is for — app backgrounded, screen
 * off, phone in a pocket between sets. A worker is the only thing the browser
 * may still be running then.
 *
 * What it cannot promise: there is no scheduled-notification API on iOS, and a
 * worker with a pending timer is killed whenever the browser decides to. So
 * this fires the alert when the worker is still alive, the page fires it when
 * the page is, and the beep scheduled in the audio graph covers the rest. Three
 * cheap attempts at the same alert, none of which is reliable on its own.
 */

let pending = null;

function clearPending() {
  if (pending !== null) {
    clearTimeout(pending);
    pending = null;
  }
}

function show(label) {
  return self.registration.showNotification('Descanso terminado', {
    body: label || 'Va la que sigue',
    // One tag, so a rest that gets alerted twice replaces its own banner
    // instead of stacking two of them.
    tag: 'ironlog-rest',
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: { url: self.registration.scope },
  });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'ironlog-rest') return;

  clearPending();
  if (data.action === 'cancel') return;

  const delay = data.endsAt - Date.now();
  if (delay <= 0) {
    event.waitUntil(show(data.label));
    return;
  }

  // waitUntil is what asks the browser to keep this worker alive for the wait.
  // It is a request, not a guarantee, and long rests will often outlive it.
  event.waitUntil(
    new Promise((resolve) => {
      pending = setTimeout(() => {
        pending = null;
        show(data.label).then(resolve, resolve);
      }, delay);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'ironlog-rest') return;
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
