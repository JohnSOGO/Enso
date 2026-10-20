// SPEC §8.18 — the Ensō button and its popup, rendered once by App.tsx: tap, say what you want into the text box
// (heard words fill it; type or fix it by hand; 🗑 Clear starts over, ⚑ Q338), POST /say, then what Ensō heard and
// what it will do, spoken aloud, with Yes / Clarify / Cancel. Yes on a reminder opens the reminder form filled in; on
// a request POST /feature-requests, then for an admin's small one "Build it now?" (⚑ Q344). Outside the scope (§1.3): Clarify / OK, and leaving any way but Clarify logs it
// as Out of scope (POST /feature-requests with outside). Tap to talk (⚑ Q360): the mark opens it; the Ensō mark inside
// starts listening (the first tap is when the phone asks for the mic) and a second tap stops. Renders what the server
// read; never decides it.
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { ReminderForm } from './Reminders';
import { EventForm } from './EventForm';
import { FeatureRequests } from './FeatureRequests';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { speak, stopSpeaking, unlockSpeech, useListen } from './useSpeech';
import { errorText, post } from '../api';
import { canBuild, type FeatureRequest } from '../../../src/shared/feature-requests';
import { SAY_TEXT_MAX, clarified, type SayEvent, type SayReading, type SayReminder } from '../../../src/shared/say-reading';
import s from './EnsoButton.module.css';

type Phase = 'closed' | 'listen' | 'reading' | 'answer' | 'saved';
const SAVED = 'Saved. Thanks!';
const SAVED_BUILD = 'Saved. Build it now?'; // ⚑ Q344, to an admin when the request is small
const BUILDING = "Building now. John gets a ping when it's live.";
const QUIET_MS = 8000; // nothing heard this long → the keyboard-🎤 hint (⚑ Q338)

export function EnsoButton() {
  const listen = useListen();
  const { me } = useApp();
  const [requests, setRequests] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const base = useRef(''); // what the box held when listening began; heard words go after it
  const edited = useRef(false); // typed by hand since listening began: heard words no longer fill the box
  const [phase, setPhase] = useState<Phase>('closed');
  const [typed, setTyped] = useState('');
  const [before, setBefore] = useState<string | null>(null); // Clarify: what was said before
  const [reading, setReading] = useState<SayReading | null>(null);
  const [form, setForm] = useState<SayReminder | null>(null);
  const [eventForm, setEventForm] = useState<SayEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FeatureRequest | null>(null); // offered Build now (⚑ Q344)
  const [building, setBuilding] = useState(false);

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

  function listenFrom(text: string, on: boolean) {
    base.current = text; edited.current = false; setTyped(text); setQuiet(false);
    if (on && !listen.unavailable) listen.start(); else listen.stop();
  }
  function begin() { stopSpeaking(); setError(null); setPhase('listen'); listenFrom('', false); }
  function edit(text: string) { edited.current = true; if (listen.listening) listen.stop(); setTyped(text); }
  const open = () => { setBefore(null); setReading(null); begin(); };
  // ⚑ Q360 — the Ensō mark in the box: a tap listens (after what the box holds), the next tap stops.
  function talk() {
    if (listen.listening) { listen.stop(); return; }
    if (listen.unavailable) { setQuiet(true); return; }
    stopSpeaking(); listenFrom(typed, true);
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
    if (reading.kind === 'event') { setEventForm(reading.event); setPhase('closed'); return; }
    if (reading.kind !== 'request') { close(); return; }
    try {
      const r = await post<FeatureRequest>('/feature-requests', { text: reading.heard, ...reading.request });
      const offer = isAdmin(me) && canBuild(r.status);
      setSaved(offer ? r : null); setBuilding(false); setPhase('saved'); speak(offer ? SAVED_BUILD : SAVED);
    } catch (e) { setError(errorText(e)); }
  }
  async function buildNow() {
    if (!saved) return;
    setError(null);
    try { await post(`/feature-requests/${saved.id}/build`, {}); setSaved(null); setBuilding(true); speak(BUILDING); }
    catch (e) { setError(errorText(e)); }
  }
  function clarify() { setBefore(reading?.heard ?? before); setReading(null); begin(); }

  return (
    <>
      <button className={s.enso} aria-label="Ensō: say what you want" title="Say what you want" onClick={open}>
        <img src="/icon.svg" alt="" draggable={false} />
      </button>
      {phase !== 'closed' && (
        <Modal title="Ensō" onClose={close} error={error} footer={footer()}>
          {before && phase === 'listen' && <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Before: {before}</p>}
          {phase === 'listen' && (
            <div className="field" aria-live="polite">
              <div className={s.talkRow}>
                <button type="button" className={`${s.talk} ${listen.listening ? s.on : ''}`} onClick={talk}
                  aria-pressed={listen.listening} aria-label={listen.listening ? 'Stop listening' : 'Talk'}>
                  <img src="/icon.svg" alt="" draggable={false} />
                </button>
                <span className={s.listening}>{hint ? 'Tap the 🎤 on your keyboard and talk.' : listen.listening ? '🎤 Listening… tap Ensō to stop.' : 'Tap Ensō to talk, or type.'}</span>
              </div>
              <textarea aria-label="What you want" rows={4} autoFocus={listen.unavailable} value={typed} maxLength={SAY_TEXT_MAX}
                placeholder="Weekdays 8 to 11, remind me to book the car check" onChange={(e) => edit(e.target.value)} />
            </div>
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
          {phase === 'saved' && <p className={s.say}>{building ? BUILDING : saved ? SAVED_BUILD : SAVED}</p>}
        </Modal>
      )}
      {requests && <Modal title="💡 Requests" onClose={() => setRequests(false)}><FeatureRequests /></Modal>}
      {form && <ReminderForm reminder={null} start={form} onClose={() => setForm(null)} />}
      {eventForm && <EventForm date={eventForm.date} start={eventForm} onClose={() => setEventForm(null)} />}
    </>
  );

  function footer() {
    if (phase === 'listen') return <>
      <button className="primary" onClick={send} disabled={!words.trim()}>Done</button>
      <button onClick={() => listenFrom('', listen.listening)}>🗑 Clear</button>
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
    if (phase === 'saved' && saved) return <>
      <button className="primary" onClick={buildNow}>Build now</button>
      <button onClick={close}>Later</button>
    </>;
    if (phase === 'saved') return <button className="primary" onClick={close}>OK</button>;
    return <button onClick={close}>Cancel</button>;
  }
}
