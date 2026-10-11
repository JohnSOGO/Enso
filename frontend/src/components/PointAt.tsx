// SPEC §8.16 ⚑ Q235–Q236 — the pick layer, rendered once by the frame: the floating 🎯, pick mode on until a 🎯, the bar
// or Esc (Alt+P toggles), the bar (inside the topmost open modal so it is never behind it), the capture-phase listeners
// that swallow every tap while on, the outline and crosshair for a mouse, then each pick straight to the clipboard and
// a toast with the text. What the text says is point-line.ts's.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { describeTap, pickText, pickedThing } from '../point-line';
import { PointAtButton, onToggle, togglePick, usePointAtOn } from './PointAtButton';
import s from './PointAt.module.css';

/** After the finger lifts, how long a click may still follow before the pick is shown (iOS sends none). */
const CLICK_WAIT_MS = 400;
/** How long the toast stays: copied, or copy blocked (long enough to select the text by hand). */
const TOAST_MS = 4000;
const TOAST_BLOCKED_MS = 15000;
/** Global class names, so selectorFor can leave them out of a selector. */
const HOVER = 'enso-pick-hover';
const ON = 'enso-pick-on';

export function PointAtLayer({ tab }: { tab: string }) {
  const enabled = usePointAtOn();
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState<{ text: string; copied: boolean } | null>(null);
  useEffect(() => onToggle(() => setOn((v) => !v)), []);
  useEffect(() => { if (!enabled) setOn(false); }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const key = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP') { e.preventDefault(); togglePick(); }
      else if (e.key === 'Escape' && on) { e.preventDefault(); e.stopImmediatePropagation(); setOn(false); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [enabled, on]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.copied ? TOAST_MS : TOAST_BLOCKED_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.classList.add(ON);
    let hover: Element | null = null;
    const setHover = (el: Element | null) => {
      if (hover === el) return;
      hover?.classList.remove(HOVER);
      hover = el;
      hover?.classList.add(HOVER);
    };
    // One tap at a time: the element, its text, and the clipboard write started inside the tap's own handlers.
    let picked: Element | null = null;
    let text: string | null = null;
    let copy: Promise<boolean> | null = null;
    let timer = 0;
    const take = (e: Event) => {
      if (picked || !(e.target instanceof Element)) return;
      picked = e.target;
      if (!picked.closest('[data-point-at]')) text = pickText(describeTap(picked, tab), __ENSO_BUILD__, innerWidth, innerHeight);
    };
    // Copied inside the tap's own handlers: phones allow the clipboard only during a user gesture (iOS: touchend).
    const copyNow = () => {
      if (!text || copy || !navigator.clipboard) return;
      copy = navigator.clipboard.writeText(text).then(() => true, () => { copy = null; return false; });
    };
    const finish = () => {
      clearTimeout(timer);
      const was = picked;
      const said = text;
      const copied = copy ?? Promise.resolve(false);
      picked = null; text = null; copy = null;
      if (!was) return;
      if (was.closest('[data-point-at]')) { setOn(false); return; }
      if (said) void copied.then((ok) => setToast({ text: said, copied: ok }));
    };
    const ours = (e: Event) => e.target instanceof Element && e.target.closest('[data-pick-toast]') !== null;
    const swallow = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
    const guard = (f: (e: Event) => void) => (e: Event) => { if (!ours(e)) f(e); };
    const down = guard((e) => { swallow(e); take(e); copyNow(); });
    const up = guard((e) => { swallow(e); copyNow(); if (picked) { clearTimeout(timer); timer = window.setTimeout(finish, CLICK_WAIT_MS); } });
    const click = guard((e) => { swallow(e); take(e); copyNow(); finish(); });
    const over = guard((e) => { if (e.target instanceof Element) setHover(pickedThing(e.target)); });
    const plan: [string, (e: Event) => void][] = [
      ['pointerdown', down], ['touchstart', down], ['mousedown', down],
      ['pointerup', up], ['touchend', up], ['mouseup', up], ['click', click],
      ['contextmenu', guard(swallow)], ['dblclick', guard(swallow)], ['auxclick', guard(swallow)], ['submit', guard(swallow)],
      ['mouseover', over],
    ];
    const opts = { capture: true, passive: false };
    plan.forEach(([type, f]) => window.addEventListener(type, f, opts));
    return () => {
      clearTimeout(timer);
      plan.forEach(([type, f]) => window.removeEventListener(type, f, opts));
      setHover(null);
      root.classList.remove(ON);
    };
  }, [on, tab]);

  const dialogs = document.querySelectorAll('dialog[open]');
  const home = dialogs.length ? dialogs[dialogs.length - 1] : document.body;

  return (
    <>
      {enabled && <PointAtButton className={s.float} />}
      {on && createPortal(<div className={s.bar} data-point-at role="status">🎯 Pick mode: tap anything to copy where it is · tap here to stop</div>, home)}
      {toast && createPortal(
        <div className={s.toast} data-pick-toast role="status">
          <strong>{toast.copied ? '✓ Copied. Paste it into Claude.' : 'Copy blocked: press and hold to select this text.'}</strong>
          {toast.text}
        </div>, home)}
    </>
  );
}
