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

/**
 * Listen (⚑ Q338): `words` grows as it hears, `heard` once any word came in; `unavailable` when the phone has no
 * speech-to-text; `refused` when this try was refused or failed (no mic, the keyboard holding it): start() tries again. The iPhone's recognizer stops after each phrase (and drops results when
 * continuous), so it runs one phrase at a time and starts again on end, keeping what was heard, until stop / reset.
 */
export function useListen() {
  const rec = useRef<Recognizer | null>(null);
  const want = useRef(false);
  const kept = useRef(''); // finished phrases
  const now = useRef(''); // the phrase being heard
  const restarts = useRef(0);
  const [words, setWords] = useState('');
  const [heard, setHeard] = useState(false);
  const [listening, setListening] = useState(false);
  const [unavailable, setUnavailable] = useState(() => recognizerCtor() === null);
  const [refused, setRefused] = useState(false);

  const run = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor) { setUnavailable(true); want.current = false; setListening(false); return; }
    try {
      const r = new Ctor();
      r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false;
      r.onresult = (e) => {
        if (rec.current !== r) return;
        now.current = Array.from(e.results).map((x) => x[0].transcript).join(' ');
        const all = join(kept.current, now.current);
        setWords(all); if (all) setHeard(true);
      };
      r.onerror = (e) => { if (FATAL.has(e.error)) { want.current = false; setRefused(true); } };
      r.onend = () => {
        if (rec.current !== r) return; // an older recognizer, replaced by Clear
        kept.current = join(kept.current, now.current); now.current = '';
        if (want.current && restarts.current++ < RESTARTS) run(); else setListening(false);
      };
      rec.current = r;
      setListening(true);
      r.start();
    } catch { want.current = false; setRefused(true); setListening(false); }
  }, []);
  const start = useCallback(() => {
    rec.current?.abort();
    kept.current = ''; now.current = ''; restarts.current = 0;
    setWords(''); setHeard(false); setRefused(false);
    want.current = true; run();
  }, [run]);
  const stop = useCallback(() => { want.current = false; rec.current?.stop(); setListening(false); }, []);
  useEffect(() => () => { want.current = false; rec.current?.abort(); }, []);
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
