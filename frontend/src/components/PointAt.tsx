// SPEC §8.16 ⚑ Q235–Q236 — the pick layer, rendered once by the frame: the floating 🎯, the armed state, the bar
// (inside the topmost open modal so it is never behind it), the capture-phase listeners that swallow the one next
// tap, then the line straight to the clipboard and the 📍 Pointed at modal. What the line says is point-line.ts's.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { describeTap, pointLine } from '../point-line';
import { Modal } from './Modal';
import { PointAtButton, armPick, onArm, usePointAtOn } from './PointAtButton';
import s from './PointAt.module.css';

/** After the finger lifts, how long a click may still follow before the pick is shown (iOS sends none). */
const CLICK_WAIT_MS = 400;

export function PointAtLayer({ tab }: { tab: string }) {
  const on = usePointAtOn();
  const [armed, setArmed] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => onArm(() => { setLine(null); setCopied(false); setArmed(true); }), []);
  useEffect(() => { if (!on) setArmed(false); }, [on]);

  useEffect(() => {
    if (!armed) return;
    let picked: Element | null = null;
    let text: string | null = null;
    let copying = false;
    let timer = 0;
    const take = (e: Event) => {
      if (picked || !(e.target instanceof Element)) return;
      picked = e.target;
      if (!picked.closest('[data-point-at]')) text = pointLine(describeTap(picked, tab, __ENSO_BUILD__, `${innerWidth}×${innerHeight}`));
    };
    // Copied inside the tap's own handlers: phones allow the clipboard only during a user gesture (iOS: touchend).
    const copyNow = () => {
      if (!text || copying || !navigator.clipboard) return;
      copying = true;
      navigator.clipboard.writeText(text).then(() => setCopied(true), () => { copying = false; });
    };
    const finish = () => {
      clearTimeout(timer);
      setArmed(false);
      if (text) setLine(text);
    };
    const swallow = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
    const down = (e: Event) => { swallow(e); take(e); copyNow(); };
    const up = (e: Event) => { swallow(e); copyNow(); if (picked) { clearTimeout(timer); timer = window.setTimeout(finish, CLICK_WAIT_MS); } };
    const click = (e: Event) => { swallow(e); take(e); copyNow(); finish(); };
    const plan: [string, (e: Event) => void][] = [
      ['pointerdown', down], ['touchstart', down], ['mousedown', down],
      ['pointerup', up], ['touchend', up], ['mouseup', up], ['contextmenu', swallow], ['click', click],
    ];
    const opts = { capture: true, passive: false };
    plan.forEach(([type, f]) => window.addEventListener(type, f, opts));
    return () => { clearTimeout(timer); plan.forEach(([type, f]) => window.removeEventListener(type, f, opts)); };
  }, [armed, tab]);

  const copy = () => { if (line) navigator.clipboard?.writeText(line).then(() => setCopied(true), () => setCopied(false)); };
  const dialogs = document.querySelectorAll('dialog[open]');
  const barHome = dialogs.length ? dialogs[dialogs.length - 1] : document.body;

  return (
    <>
      {on && <PointAtButton className={s.float} />}
      {armed && createPortal(<div className={s.bar} data-point-at role="status">🎯 Tap the thing you mean · tap here to cancel</div>, barHome)}
      {line && (
        <Modal title="📍 Pointed at" onClose={() => setLine(null)}
          footer={<><button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button><button onClick={armPick}>Pick again</button></>}>
          <p className={s.line}>{line}</p>
          {copied && <p className="muted" style={{ marginTop: 8 }}>✓ Copied. Paste it into Claude.</p>}
        </Modal>
      )}
    </>
  );
}
