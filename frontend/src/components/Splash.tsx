// SPEC §8.10 — the opening screen: plain HTML in index.html (#splash) covers loading; this removes it. It never asks for
// the microphone: the Ensō button does, on its first tap to talk (§8.18 ⚑ Q360).
import { useEffect } from 'react';

/** The opening screen stays at least this long from page start (§8.10). */
const SPLASH_MIN_MS = 800;

/** Removes the opening screen once `ready` (App knows who this is), after at least 0.8 s from page start so it never flickers. */
export function Splash({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    const splash = document.getElementById('splash');
    if (!splash) return;
    const t = setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => splash.remove(), 300);
    }, Math.max(0, SPLASH_MIN_MS - performance.now()));
    return () => clearTimeout(t);
  }, [ready]);
  return null;
}
