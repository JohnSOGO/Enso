// SPEC §8.18 ⚑ Q331, Q333, Q334 — the phone's own speech: listening (the browser's SpeechRecognition, where it has
// one) and speaking (speechSynthesis, the best English voice). No fetch, no app state.
import { useCallback, useEffect, useRef, useState } from 'react';

/** The bit of the Web Speech API used here (not in every TS DOM lib). */
interface Recognizer {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const recognizerCtor = (): RecognizerCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const join = (a: string, b: string) => `${a} ${b}`.replace(/\s+/g, ' ').trim();
/** Errors that mean this try won't listen (refused, no mic): show the keyboard hint; the next tap tries again. */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
const RESTARTS = 30; // one popup's worth of phrases; stops an endless restart loop
const END_WAIT_MS = 600; // a new listen waits this long at most for the last one's end

/**
 * Listen (⚑ Q338): `words` grows as it hears, `heard` once any word came in; `unavailable` when the phone has no
 * speech-to-text; `refused` when this try was refused or failed (no mic, the keyboard holding it): start() tries again.
 * The iPhone's recognizer stops after each phrase (and drops results when continuous), so it runs one phrase at a time
 * and starts again on end, keeping what was heard, until stop / reset. It hears nothing with a second recognizer, so
 * there is one, made on the first start and started again each time, never while it is still ending.
 */
export function useListen() {
  const rec = useRef<Recognizer | null>(null); // the one recognizer
  const live = useRef(false); // started and not yet ended
  const want = useRef(false);
  const kept = useRef(''); // finished phrases
  const now = useRef(''); // the phrase being heard
  const restarts = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null); // a start waiting for the last one's end
  const [words, setWords] = useState('');
  const [heard, setHeard] = useState(false);
  const [listening, setListening] = useState(false);
  const [unavailable, setUnavailable] = useState(() => recognizerCtor() === null);
  const [refused, setRefused] = useState(false);

  const begin = useCallback((r: Recognizer) => {
    try { live.current = true; setListening(true); r.start(); }
    catch { live.current = false; want.current = false; setRefused(true); setListening(false); }
  }, []);
  /** The waiting start, once: on the last one's end or after END_WAIT_MS, whichever comes first. */
  const resume = useCallback((r: Recognizer) => {
    if (!pending.current) return;
    clearTimeout(pending.current); pending.current = null;
    live.current = false;
    if (want.current) begin(r); else setListening(false);
  }, [begin]);
  const recognizer = useCallback((): Recognizer | null => {
    if (rec.current) return rec.current;
    const Ctor = recognizerCtor();
    if (!Ctor) { setUnavailable(true); return null; }
    const r = new Ctor();
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => {
      if (pending.current) return; // the last listen's late words, after a new start
      now.current = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      const all = join(kept.current, now.current);
      setWords(all); if (all) setHeard(true);
    };
    r.onerror = (e) => { if (FATAL.has(e.error)) { want.current = false; setRefused(true); } };
    r.onend = () => {
      if (pending.current) { resume(r); return; }
      live.current = false;
      kept.current = join(kept.current, now.current); now.current = '';
      if (want.current && restarts.current++ < RESTARTS) begin(r); else setListening(false);
    };
    rec.current = r;
    return r;
  }, [begin, resume]);

  const start = useCallback(() => {
    kept.current = ''; now.current = ''; restarts.current = 0;
    setWords(''); setHeard(false); setRefused(false);
    let r: Recognizer | null;
    try { r = recognizer(); } catch { setRefused(true); return; }
    if (!r) return;
    want.current = true;
    if (!live.current) { begin(r); return; }
    setListening(true);
    if (pending.current) return; // already waiting for its end
    const waiting = r;
    pending.current = setTimeout(() => resume(waiting), END_WAIT_MS);
    r.abort();
  }, [recognizer, begin, resume]);
  const stop = useCallback(() => {
    want.current = false;
    if (pending.current) { clearTimeout(pending.current); pending.current = null; }
    const r = rec.current;
    r?.stop(); setListening(false); // its last words still come…
    setTimeout(() => { if (r && live.current && !want.current) r.abort(); }, END_WAIT_MS); // …but it must end, freeing the mic
  }, []);
  useEffect(() => () => { want.current = false; if (pending.current) clearTimeout(pending.current); rec.current?.abort(); }, []);
  return { words, heard, listening, unavailable, refused, start, stop };
}

/** English, Enhanced / Premium (the iPhone's human-sounding voices) first, then the phone's default English one. */
export function bestVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const rank = (v: SpeechSynthesisVoice) => (/premium/i.test(v.name) ? 0 : /enhanced/i.test(v.name) ? 1 : v.localService ? 2 : 3)
    + (v.lang.toLowerCase() === (navigator.language || 'en-US').toLowerCase() ? 0 : 0.5);
  return [...en].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice(window.speechSynthesis.getVoices());
  if (v) { u.voice = v; u.lang = v.lang; }
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** iOS speaks only after a tap: a silent word on the tap lets the answer, which comes later, be spoken. */
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
