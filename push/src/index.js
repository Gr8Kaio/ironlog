/*
 * IronLog rest-timer push.
 *
 * Why a server at all: iOS freezes an installed PWA the moment it leaves the
 * screen, service worker included, and has no scheduled-notification API. The
 * only thing that wakes it is a push from outside. So the page tells this
 * Worker "the rest ends at T", and at T this Worker sends the push.
 *
 * One Durable Object per subscription, keyed by its endpoint. Its alarm is the
 * timer: exact to the second, and it survives with nothing running between
 * the schedule and the send. A new schedule overwrites the old one, which is
 * what +30 s on the timer needs.
 *
 * It stores a push subscription and a deadline, nothing else, and forgets
 * both once the push is sent.
 */

import { DurableObject } from 'cloudflare:workers';
import { sendPush } from './webpush.js';

const ALLOWED_ORIGINS = ['https://gr8kaio.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const SUBJECT = 'https://gr8kaio.github.io/ironlog/';
/** Far enough out to cover any real rest, short enough that a typo cannot park an alarm for a week. */
const MAX_AHEAD_MS = 30 * 60_000;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('IronLog push', { headers });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403, headers });

    const path = new URL(request.url).pathname;
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad JSON', { status: 400, headers });
    }
    const endpoint = body?.subscription?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return new Response('No subscription', { status: 400, headers });
    }

    const stub = env.TIMERS.get(env.TIMERS.idFromName(endpoint));
    if (path === '/schedule') {
      const endsAt = Number(body.endsAt);
      if (!Number.isFinite(endsAt) || endsAt > Date.now() + MAX_AHEAD_MS) {
        return new Response('Bad endsAt', { status: 400, headers });
      }
      const keys = body.subscription.keys;
      if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
        return new Response('No keys', { status: 400, headers });
      }
      await stub.schedule({
        subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        endsAt,
        label: typeof body.label === 'string' ? body.label.slice(0, 120) : '',
      });
      return new Response('ok', { headers });
    }
    if (path === '/cancel') {
      await stub.cancel();
      return new Response('ok', { headers });
    }
    return new Response('Not found', { status: 404, headers });
  },
};

export class RestTimer extends DurableObject {
  async schedule(job) {
    await this.ctx.storage.put('job', job);
    // An alarm in the past fires right away, which is the right thing for a
    // rest that ran out on the way here.
    await this.ctx.storage.setAlarm(Math.max(job.endsAt, Date.now()));
  }

  async cancel() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete('job');
  }

  async alarm() {
    const job = await this.ctx.storage.get('job');
    if (!job) return;
    await this.ctx.storage.delete('job');
    const response = await sendPush({
      subscription: job.subscription,
      payload: { title: 'Descanso terminado', body: job.label || 'Va la que sigue', endsAt: job.endsAt },
      privateJwk: JSON.parse(this.env.VAPID_PRIVATE_JWK),
      publicKey: this.env.VAPID_PUBLIC_KEY,
      subject: SUBJECT,
    });
    // 404/410 is the subscription being gone for good (app deleted, permission
    // revoked). Nothing to retry and nothing to keep. Anything else unexpected
    // is logged for `wrangler tail`.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      console.log('push failed', response.status, await response.text());
    }
  }
}
