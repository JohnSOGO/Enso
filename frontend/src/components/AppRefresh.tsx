// SPEC §8.10 — always fresh: reload when the app comes back to the foreground (never over an open
// dialog — a half-filled form or a one-time invite card is never thrown away), and pull down to
// refresh on any screen's scroll area. Page lifecycle only: no app state, no data fetching.
import { useEffect, useRef, useState } from 'react';
import s from './AppRefresh.module.css';

/** Drag distance (px) past which releasing reloads. */
const ARM_PX = 72;

const dialogOpen = () => document.querySelector('dialog[open]') !== null;

/** The nearest vertically scrollable ancestor of `el` — the screen's scroll area — or null. */
function scrollArea(el: Element | null): HTMLElement | null {
  for (let n = el instanceof HTMLElement ? el : null; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
  }
  return null;
}

export function AppRefresh() {
  const [pull, setPull] = useState(0);
  const drag = useRef<{ y: number; area: HTMLElement | null; dy: number } | null>(null);

  // Coming back → reload, unless a dialog is open (it is skipped; the next return without one reloads).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !dialogOpen()) location.reload();
    };
    // iOS may restore a home-screen app from its page cache instead of firing visibilitychange.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) onVisible(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  // Pull down to refresh: only from the very top of a scroll area, never inside a dialog.
  useEffect(() => {
    const atTop = (area: HTMLElement | null) => !area || area.scrollTop <= 0;
    const onStart = (e: TouchEvent) => {
      const t = e.target as Element | null;
      if (e.touches.length !== 1 || !t || t.closest('dialog')) { drag.current = null; return; }
      const area = scrollArea(t);
      drag.current = atTop(area) ? { y: e.touches[0].clientY, area, dy: 0 } : null;
    };
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.touches[0].clientY - d.y;
      if (dy <= 0 || !atTop(d.area)) { drag.current = null; setPull(0); return; }
      d.dy = dy;
      setPull(dy);
    };
    const onEnd = () => {
      const armed = (drag.current?.dy ?? 0) >= ARM_PX;
      drag.current = null;
      if (armed) location.reload(); else setPull(0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (pull <= 0) return null;
  const armed = pull >= ARM_PX;
  return (
    <div className={`${s.pill} ${armed ? s.armed : ''}`} role="status"
      style={{ transform: `translate(-50%, ${Math.min(pull, ARM_PX + 24) * 0.5}px)` }}>
      {armed ? '↻ Release to refresh' : '↓ Pull to refresh'}
    </div>
  );
}
