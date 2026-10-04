// SPEC §9.1 — browser push plumbing: the service worker registration, this browser's facts, and
// turning phone alerts on/off. No React, no app state; the Phone alerts row (PhoneAlerts.tsx) renders it.
import { ApiError, del, post } from './api';

const SW_URL = '/sw.js';
const SW_OPTIONS: RegistrationOptions = { scope: '/', updateViaCache: 'none' };

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Registers `/sw.js` once at app start (§9.1). A no-op where service workers are unsupported. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(SW_URL, SW_OPTIONS)
    .catch((e) => console.warn('service worker registration failed', e));
}

export interface PushFacts {
  supported: boolean;
  isIOS: boolean;
  /** Running as the home-screen app (iOS allows push only there). */
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
  /** This browser's current push subscription endpoint, or null. */
  endpoint: string | null;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration('/');
}

export async function facts(): Promise<PushFacts> {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!supported()) return { supported: false, isIOS, standalone, permission: 'unsupported', endpoint: null };
  const sub = await (await registration())?.pushManager.getSubscription();
  return { supported: true, isIOS, standalone, permission: Notification.permission, endpoint: sub?.endpoint ?? null };
}

const keyBytes = (b64url: string) =>
  Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sameKey = (a: ArrayBuffer | null, b: Uint8Array) =>
  a !== null && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

/**
 * Turn on, from the tap itself: the permission prompt MUST be the first call — iOS only shows it
 * inside a user gesture, so nothing is awaited before it. → the new subscription's server id.
 */
export async function turnOn(publicKey: string): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') throw new Error('Notifications are blocked for Ensō on this phone — change it in the phone’s settings.');
  if (permission !== 'granted') throw new Error('Notifications were not allowed, so phone alerts stay off.');
  // A failed registration throws here (shown), rather than leaving `ready` waiting forever.
  if (!(await registration())) await navigator.serviceWorker.register(SW_URL, SW_OPTIONS);
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const r = await post<{ id: string }>('/push/subscriptions', { ...sub.toJSON(), userAgent: navigator.userAgent });
  return r.id;
}

/** Turn off: unsubscribe this browser, then delete its server row (`id` null when the server has none). */
export async function turnOff(id: string | null): Promise<void> {
  await (await (await registration())?.pushManager.getSubscription())?.unsubscribe();
  if (!id) return;
  try { await del(`/push/subscriptions/${id}`); } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone is the end we wanted
  }
}
