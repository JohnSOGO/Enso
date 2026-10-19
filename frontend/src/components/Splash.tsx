// SPEC §8.10 — the opening screen: plain HTML in index.html (#splash) covers loading; this removes it. Voice first
// (⚑ Q342): signed in, with the mic not allowed, it stays and shows the phone's own mic popup by itself, until the
// answer. Only a phone that won't show it without a tap gets 🎤 Allow microphone / Deny to tap first.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MicAsk } from './useSpeech';
import s from './Splash.module.css';

/** The opening screen stays at least this long from page start (§8.10). */
const SPLASH_MIN_MS = 800;

/** Removes the opening screen once `ready` (App knows who this is), after at least 0.8 s from page start so it never flickers. */
export function Splash({ ready, signedIn, mic }: { ready: boolean; signedIn: boolean; mic: MicAsk }) {
  const [notNow, setNotNow] = useState(false); // Deny holds for this opening only; the next one asks again
  const [asking, setAsking] = useState(false);
  const [needsTap, setNeedsTap] = useState(false); // the phone refused to show its popup without a tap
  const askVoice = signedIn && mic.show && !mic.refused && !notNow;
  const leave = ready && mic.checked && !askVoice;
  const autoAsk = ready && mic.checked && askVoice && !needsTap;
  useEffect(() => { // ask at once, with no tap: the phone's own popup
    if (!autoAsk) return;
    let live = true;
    void mic.ask().then((r) => {
      if (!live) return;
      if (r === 'needs-tap') setNeedsTap(true); else setNotNow(true); // answered either way: open the app
    });
    return () => { live = false; };
  }, [autoAsk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!leave) return;
    const splash = document.getElementById('splash');
    if (!splash) return;
    const t = setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => splash.remove(), 300);
    }, Math.max(0, SPLASH_MIN_MS - performance.now()));
    return () => clearTimeout(t);
  }, [leave]);
  const splash = document.getElementById('splash');
  if (!ready || !mic.checked || !askVoice || !needsTap || !splash) return null;
  async function turnOn() { setAsking(true); await mic.ask(); setNotNow(true); } // answered either way: open the app
  return createPortal(
    <div className={s.voice}>
      <button className={s.on} onClick={turnOn} disabled={asking}>🎤 Allow microphone</button>
      <button className={s.later} onClick={() => setNotNow(true)} disabled={asking}>Deny</button>
    </div>,
    splash,
  );
}
