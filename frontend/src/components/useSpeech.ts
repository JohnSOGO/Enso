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

/** Listen: `words` grows as it hears; `unavailable` once the phone has no speech-to-text or it failed / was refused. */
export function useListen() {
  const rec = useRef<Recognizer | null>(null);
  const [words, setWords] = useState('');
  const [listening, setListening] = useState(false);
  const [unavailable, setUnavailable] = useState(() => recognizerCtor() === null);

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor) { setUnavailable(true); return; }
    try {
      const r = new Ctor();
      r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = true;
      r.onresult = (e) => setWords(Array.from(e.results).map((x) => x[0].transcript).join(' ').replace(/\s+/g, ' ').trim());
      r.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setUnavailable(true); };
      r.onend = () => setListening(false);
      rec.current = r;
      setWords(''); setListening(true);
      r.start();
    } catch { setUnavailable(true); setListening(false); }
  }, []);
  useEffect(() => () => rec.current?.abort(), []);
  return { words, listening, unavailable, start, stop };
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
