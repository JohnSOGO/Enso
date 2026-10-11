// SPEC §8.16 ⚑ Q234 — 🎯 Point at it, this device's switch (localStorage, not the account), the toggle signal, and the
// 🎯 button that turns pick mode on and off. A leaf: Modal, SettingsMe and PointAt import it; it imports no component.
import { useSyncExternalStore } from 'react';

const KEY = 'enso.pointAt';
const listeners = new Set<() => void>();
const toggle = new EventTarget();

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const usePointAtOn = () => useSyncExternalStore(subscribe, read, () => false);

export function setPointAtOn(on: boolean) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
  listeners.forEach((f) => f());
}

export const togglePick = () => { toggle.dispatchEvent(new Event('toggle')); };
export function onToggle(f: () => void) { toggle.addEventListener('toggle', f); return () => toggle.removeEventListener('toggle', f); }

/** `data-point-at` marks it so a tap on it in pick mode stops it instead of being named. Renders nothing when off. */
export function PointAtButton({ className = 'plain' }: { className?: string }) {
  if (!usePointAtOn()) return null;
  return <button type="button" className={className} data-point-at aria-label="Point at it" title="Point at it" onClick={togglePick}>🎯</button>;
}
