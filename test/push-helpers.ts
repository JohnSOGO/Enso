// SPEC §9.1 (P3, P9) — the phone's side of Web Push, written from RFC 8291 / RFC 8188 directly
// (WebCrypto HKDF, not the library's code), so a decrypt here cross-checks the sender.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const utf8 = (s: string) => new TextEncoder().encode(s);

export interface FakeSubscriber { endpoint: string; keys: { p256dh: string; auth: string }; privateKey: CryptoKey; publicRaw: Uint8Array; authSecret: Uint8Array }

/** A browser's push subscription: an ECDH P-256 key pair and a 16-byte auth secret, at `endpoint`. */
export async function fakeSubscriber(endpoint: string): Promise<FakeSubscriber> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint, keys: { p256dh: b64url(publicRaw), auth: b64url(authSecret) }, privateKey: pair.privateKey, publicRaw, authSecret };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** RFC 8291 aes128gcm: header (salt, rs, idlen, keyid = the server's ephemeral key) → ECDH → HKDF → AES-GCM → unpad. */
export async function decryptPush(sub: FakeSubscriber, body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const serverRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const serverKey = await crypto.subtle.importKey('raw', serverRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey } as any /* workers-types spells it $public */, sub.privateKey, 256));
  const ikm = await hkdf(sub.authSecret, ecdh, concat(utf8('WebPush: info\0'), sub.publicRaw, serverRaw), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 0x02) throw new Error('no last-record delimiter (0x02)');
  return new TextDecoder().decode(padded.slice(0, end));
}

/** The header and claims of a VAPID JWT, and whether its ES256 signature verifies under `publicKeyB64url`. */
export async function readVapidJwt(jwt: string, publicKeyB64url: string) {
  const [h, p, sig] = jwt.split('.');
  const key = await crypto.subtle.importKey('raw', fromB64url(publicKeyB64url), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(sig), utf8(`${h}.${p}`));
  const json = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)));
  return { header: json(h), claims: json(p) as { aud: string; exp: number; sub: string }, valid };
}
