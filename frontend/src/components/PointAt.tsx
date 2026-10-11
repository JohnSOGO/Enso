// SPEC §8.16 ⚑ Q235–Q236 — the pick layer, rendered once by the frame: the floating 🎯, the armed state, the bar
// (inside the topmost open modal so it is never behind it), the capture-phase listeners that swallow the one next
// tap, then the 📍 Pointed at modal. What the line says is point-line.ts's.
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
    let timer = 0;
    const finish = () => {
      clearTimeout(timer);
      setArmed(false);
      if (picked && !picked.closest('[data-point-at]')) {
        setLine(pointLine(describeTap(picked, tab, __ENSO_BUILD__, `${innerWidth}×${innerHeight}`)));
      }
    };
    const swallow = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
    const down = (e: Event) => { swallow(e); if (!picked && e.target instanceof Element) picked = e.target; };
    const up = (e: Event) => { swallow(e); if (picked) { clearTimeout(timer); timer = window.setTimeout(finish, CLICK_WAIT_MS); } };
    const click = (e: Event) => { swallow(e); if (!picked && e.target instanceof Element) picked = e.target; finish(); };
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
          footer={<><button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button><button onClick={armPick}>Pick again</button></>}>
          <p className={s.line}>{line}</p>
        </Modal>
      )}
    </>
  );
}
