/*
 * Checks push/src/webpush.js against an independent receiver.
 *
 *   node scripts/check-push.mjs
 *
 * The decrypt below is written against Node's own crypto (createECDH,
 * hkdfSync, createDecipheriv), not WebCrypto, so a mistake shared by both
 * halves would have to be made twice in two different APIs.
 */
import { createECDH, createDecipheriv, createVerify, hkdfSync, randomBytes, createPublicKey } from 'node:crypto';
import { encryptPayload, vapidHeader, b64urlToBytes, bytesToB64url } from '../push/src/webpush.js';

const ua = createECDH('prime256v1');
ua.generateKeys();
const auth = randomBytes(16);
const message = JSON.stringify({ title: 'Descanso terminado', body: 'Bench Press · serie 3' });

const body = Buffer.from(await encryptPayload(message, bytesToB64url(ua.getPublicKey()), bytesToB64url(auth)));

const salt = body.subarray(0, 16);
const rs = body.readUInt32BE(16);
const idlen = body[20];
const asPublic = body.subarray(21, 21 + idlen);
const cipher = body.subarray(21 + idlen);
const shared = ua.computeSecret(asPublic);
const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
const ikm = Buffer.from(hkdfSync('sha256', shared, auth, keyInfo, 32));
const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
decipher.setAuthTag(cipher.subarray(cipher.length - 16));
const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);

const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) process.exitCode = 1;
};
ok(rs === 4096 && idlen === 65, 'header: record size 4096, 65-byte sender key');
ok(plain[plain.length - 1] === 2, 'last-record delimiter 0x02');
ok(plain.subarray(0, -1).toString() === message, 'payload decrypts to the original');

// VAPID: sign with a fresh key, verify the JWT with Node.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pub = bytesToB64url(await crypto.subtle.exportKey('raw', pair.publicKey));
const header = await vapidHeader('https://web.push.apple.com/abc', jwk, pub, 'https://gr8kaio.github.io/ironlog/');
const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
const [h, c, s] = t.split('.');
const claims = JSON.parse(Buffer.from(b64urlToBytes(c)).toString());
ok(claims.aud === 'https://web.push.apple.com' && claims.sub.startsWith('https://'), 'JWT claims: aud is the push origin, sub set');
const verifier = createVerify('SHA256');
verifier.update(`${h}.${c}`);
const pubKey = createPublicKey({ key: { ...jwk, d: undefined }, format: 'jwk' });
ok(verifier.verify({ key: pubKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64urlToBytes(s))), 'JWT signature verifies');
ok(k === pub, 'k= is the raw public key');
