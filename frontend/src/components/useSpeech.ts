// SPEC §8.18 ⚑ Q331, Q334, Q378 — the phone's own voice: recording (MediaRecorder; the clip is written down by the
// caller via POST /say/hear) and speaking (speechSynthesis, the best English voice). No fetch, no app state.
import { useCallback, useEffect, useRef, useState } from 'react';

/** The type to record in: the iPhone records audio/mp4, most others audio/webm; '' lets the phone choose. */
const recordType = () => ['audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';

/**
 * Record (⚑ Q378): start() asks for the mic (the phone's popup the first time) and records; stop() ends it and hands
 * the clip to `onClip`; cancel() drops it. It stops by itself after `maxMs`. `unavailable` when the phone can't record;
 * `refused` when this try was refused or failed (the next start tries again). The mic is let go after every clip.
 */
export function useRecord(onClip: (clip: Blob) => void, maxMs: number) {
  const rec = useRef<MediaRecorder | null>(null);
  const keep = useRef(true); // false: cancel() drops the clip
  const latest = useRef(onClip);
  latest.current = onClip;
  const [recording, setRecording] = useState(false);
  const [refused, setRefused] = useState(false);
  const unavailable = typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia;

  const end = useCallback((keepIt: boolean) => {
    keep.current = keepIt;
    if (rec.current?.state === 'recording') rec.current.stop();
    setRecording(false);
  }, []);
  const start = useCallback(async () => {
    if (unavailable || rec.current?.state === 'recording') return;
    setRefused(false);
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setRefused(true); return; }
    try {
      const type = recordType();
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimeout(timer);
        if (rec.current === r) rec.current = null;
        setRecording(false);
        if (keep.current && parts.length) latest.current(new Blob(parts, { type: (r.mimeType || type || 'audio/mp4').split(';')[0] }));
      };
      const timer = setTimeout(() => end(true), maxMs);
      keep.current = true;
      rec.current = r;
      r.start();
      setRecording(true);
    } catch { stream.getTracks().forEach((t) => t.stop()); setRefused(true); }
  }, [unavailable, maxMs, end]);
  const stop = useCallback(() => end(true), [end]);
  const cancel = useCallback(() => end(false), [end]);
  useEffect(() => () => { keep.current = false; if (rec.current?.state === 'recording') rec.current.stop(); }, []);
  return { recording, unavailable, refused, start, stop, cancel };
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
