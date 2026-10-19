// SPEC §8.18 — the Ensō button and its popup, rendered once by App.tsx: tap, say what you want into the text box
// (heard words fill it; type or fix it by hand; 🗑 Clear starts over, ⚑ Q338), POST /say, then what Ensō heard and
// what it will do, spoken aloud, with Yes / Clarify / Cancel. Yes on a reminder opens the reminder form filled in; on
// a request POST /feature-requests. Outside the scope (§1.3): Clarify / OK, and leaving any way but Clarify logs it
// as Out of scope (POST /feature-requests with outside). Hold to talk (⚑ Q340): press opens it listening, letting go
// after HOLD_MS sends. Renders what the server read; never decides it.
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { ReminderForm } from './Reminders';
import { FeatureRequests } from './FeatureRequests';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { speak, stopSpeaking, unlockSpeech, useListen } from './useSpeech';
import { errorText, post } from '../api';
import { SAY_TEXT_MAX, clarified, type SayReading, type SayReminder } from '../../../src/shared/say-reading';
import s from './EnsoButton.module.css';

type Phase = 'closed' | 'listen' | 'reading' | 'answer' | 'saved';
const SAVED = 'Saved. Thanks!';
const QUIET_MS = 8000; // nothing heard this long → the keyboard-🎤 hint (⚑ Q338)
const HOLD_MS = 500; // ⚑ Q340 — held at least this long, letting go sends
const LAST_WORDS_MS = 400; // after letting go, the phone's last words still arrive

export function EnsoButton() {
  const listen = useListen();
  const { me } = useApp();
  const [requests, setRequests] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const base = useRef(''); // what the box held when listening began; heard words go after it
  const edited = useRef(false); // typed by hand since listening began: heard words no longer fill the box
  const pressed = useRef<number | null>(null); // when the mark was pressed, while held
  const release = useRef<() => void>(() => {}); // the latest "let go": reads this render's box
  const [phase, setPhase] = useState<Phase>('closed');
  const [typed, setTyped] = useState('');
  const [before, setBefore] = useState<string | null>(null); // Clarify: what was said before
  const [reading, setReading] = useState<SayReading | null>(null);
  const [form, setForm] = useState<SayReminder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const words = typed;
  const hint = listen.unavailable || quiet;

  // Heard words fill the box (the last ones may come just after it stops); typing in it stops listening, so a hand
  // edit is never written over.
  useEffect(() => { if (listen.words && !edited.current) setTyped(`${base.current} ${listen.words}`.trim()); }, [listen.words]);
  useEffect(() => {
    if (phase !== 'listen' || !listen.listening || listen.heard) return;
    const t = setTimeout(() => setQuiet(true), QUIET_MS);
    return () => clearTimeout(t);
  }, [phase, listen.listening, listen.heard]);

  function listenFrom(text: string) {
    base.current = text; edited.current = false; setTyped(text); setQuiet(false);
    if (!listen.unavailable) listen.start();
  }
  function begin() { stopSpeaking(); setError(null); setPhase('listen'); listenFrom(''); }
  function edit(text: string) { edited.current = true; if (listen.listening) listen.stop(); setTyped(text); }
  const open = () => { setBefore(null); setReading(null); begin(); };

  // Hold to talk: the press opens it listening; letting go after HOLD_MS sends, or shows the hint if nothing was heard.
  release.current = () => { if (words.trim()) void send(); else setQuiet(true); };
  function press(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = Date.now();
    open();
  }
  function letGo(cancelled: boolean) {
    const at = pressed.current;
    pressed.current = null;
    if (at === null || cancelled || Date.now() - at < HOLD_MS) return; // a tap: stays open and listening
    unlockSpeech(); // in the gesture, so the answer can be spoken
    listen.stop();
    setTimeout(() => release.current(), LAST_WORDS_MS);
  }
  const logged = useRef(false); // an outside answer is logged once
  function close() {
    listen.stop(); stopSpeaking(); setPhase('closed');
    if (phase === 'answer' && reading?.kind === 'outside' && !logged.current) {
      logged.current = true;
      post('/feature-requests', { text: reading.heard, ...reading.request, outside: true }).catch((e) => setError(errorText(e)));
    }
  }

  async function send() {
    unlockSpeech(); // on the Done tap, not before listening: the voice and the mic don't share the phone at once
    listen.stop();
    const said = words.trim();
    if (!said) { setError('Say or type what you want first.'); return; }
    const text = before ? clarified(before, said) : said;
    setPhase('reading'); setError(null);
    try {
      const r = await post<SayReading>('/say', { text });
      logged.current = false; setReading(r); setPhase('answer'); speak(r.say);
    } catch (e) { setError(errorText(e)); setPhase('listen'); base.current = said; setTyped(said); }
  }

  async function yes() {
    if (!reading) return;
    stopSpeaking();
    if (reading.kind === 'reminder') { setForm(reading.reminder); setPhase('closed'); return; }
    if (reading.kind === 'exists') { close(); return; }
    try {
      await post('/feature-requests', { text: reading.heard, ...reading.request });
      setPhase('saved'); speak(SAVED);
    } catch (e) { setError(errorText(e)); }
  }
  function clarify() { setBefore(reading?.heard ?? before); setReading(null); begin(); }

  return (
    <>
      <button className={s.enso} aria-label="Ensō: say what you want (hold to talk)" title="Say what you want, or hold to talk"
        onPointerDown={press} onPointerUp={() => letGo(false)} onPointerCancel={() => letGo(true)}
        onClick={(e) => { if (e.detail === 0) open(); }} onContextMenu={(e) => e.preventDefault()}>
        <img src="/icon.svg" alt="" draggable={false} />
      </button>
      {phase !== 'closed' && (
        <Modal title="Ensō" onClose={close} error={error} footer={footer()}>
          {before && phase === 'listen' && <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Before: {before}</p>}
          {phase === 'listen' && (
            <label className="field" aria-live="polite">
              <span className={s.listening}>{hint ? 'Tap the 🎤 on your keyboard and talk.' : listen.listening ? '🎤 Listening…' : '🎤 Tap Done to send, or Cancel.'}</span>
              <textarea rows={4} autoFocus={listen.unavailable} value={typed} maxLength={SAY_TEXT_MAX}
                placeholder="Weekdays 8 to 11, remind me to book the car check" onChange={(e) => edit(e.target.value)} />
            </label>
          )}
          {phase === 'listen' && isAdmin(me) && <button className="plain" onClick={() => setRequests(true)}>💡 Requests</button>}
          {phase === 'reading' && <p className={s.listening}>Ensō is thinking…</p>}
          {phase === 'answer' && reading && (
            <div aria-live="polite">
              <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>I heard: {reading.heard}</p>
              <p className={s.say}>{reading.say}</p>
              <button className="plain" onClick={stopSpeaking} aria-label="Stop speaking">🔇</button>
            </div>
          )}
          {phase === 'saved' && <p className={s.say}>{SAVED}</p>}
        </Modal>
      )}
      {requests && <Modal title="💡 Requests" onClose={() => setRequests(false)}><FeatureRequests /></Modal>}
      {form && <ReminderForm reminder={null} start={form} onClose={() => setForm(null)} />}
    </>
  );

  function footer() {
    if (phase === 'listen') return <>
      <button className="primary" onClick={send} disabled={!words.trim()}>Done</button>
      <button onClick={() => listenFrom('')}>🗑 Clear</button>
      <button onClick={close}>Cancel</button>
    </>;
    if (phase === 'answer' && reading?.kind === 'outside') return <>
      <button className="primary" onClick={close}>OK</button>
      <button onClick={clarify}>Clarify</button>
    </>;
    if (phase === 'answer') return <>
      <button className="primary" onClick={yes}>Yes</button>
      <button onClick={clarify}>Clarify</button>
      <button onClick={close}>Cancel</button>
    </>;
    if (phase === 'saved') return <button className="primary" onClick={close}>OK</button>;
    return <button onClick={close}>Cancel</button>;
  }
}
