// SPEC §8.16 ⚑ Q234 — 🎯 Point at it, this device's switch (localStorage, not the account), the arm signal, and the
// 🎯 button that arms one pick. A leaf: Modal, SettingsMe and PointAt import it; it imports no component.
import { useSyncExternalStore } from 'react';

const KEY = 'enso.pointAt';
const listeners = new Set<() => void>();
const arm = new EventTarget();

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const usePointAtOn = () => useSyncExternalStore(subscribe, read, () => false);

export function setPointAtOn(on: boolean) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
  listeners.forEach((f) => f());
}

export const armPick = () => { arm.dispatchEvent(new Event('arm')); };
export function onArm(f: () => void) { arm.addEventListener('arm', f); return () => arm.removeEventListener('arm', f); }

/** `data-point-at` marks it so a tap on it while armed cancels instead of being named. Renders nothing when off. */
export function PointAtButton({ className = 'plain' }: { className?: string }) {
  if (!usePointAtOn()) return null;
  return <button type="button" className={className} data-point-at aria-label="Point at it" title="Point at it" onClick={armPick}>🎯</button>;
}
