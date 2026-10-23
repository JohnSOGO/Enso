// SPEC §8.18 — the Ensō button and its popup, rendered once by App.tsx: tap, say what you want into the text box
// (a recording written down by POST /say/hear goes after what it holds, ⚑ Q378; type or fix it by hand; 🗑 Clear), POST /say, then what Ensō heard and
// what it wants and the steps Yes takes (⚑ Q380; the one sentence spoken aloud), with Yes / Clarify / Cancel / ✏️ Edit (back to the box with what was heard, ⚑ Q361). Yes on a reminder opens the reminder form filled in; on
// a request POST /feature-requests, then for an admin's small one "Build it now?" (⚑ Q344). Outside the scope (§1.3): Clarify / OK, and leaving any way but Clarify logs it
// as Out of scope (POST /feature-requests with outside). Tap to talk (⚑ Q360): the mark opens it; the Ensō mark in its
// footer starts recording (the first tap is when the phone asks for the mic) and a second tap stops and writes it down. Renders what the server
// read; never decides it.
import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { ReminderForm } from './Reminders';
import { EventForm } from './EventForm';
import { FeatureRequests } from './FeatureRequests';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { speak, stopSpeaking, unlockSpeech, useRecord } from './useSpeech';
import { errorText, post, upload } from '../api';
import { canBuild, type FeatureRequest } from '../../../src/shared/feature-requests';
import { SAY_CLIP_MAX_MS, SAY_TEXT_MAX, clarified, type SayEvent, type SayReading, type SayReminder } from '../../../src/shared/say-reading';
import s from './EnsoButton.module.css';

type Phase = 'closed' | 'listen' | 'reading' | 'answer' | 'saved';
const SAVED = 'Saved. Thanks!';
const SAVED_BUILD = 'Saved. Build it now?'; // ⚑ Q344, to an admin when the request is small
const BUILDING = "Building now. John gets a ping when it's live.";

export function EnsoButton() {
  const { me } = useApp();
  const [requests, setRequests] = useState(false);
  const [writing, setWriting] = useState(false); // a clip is being written down
  const [unwritten, setUnwritten] = useState(false); // the last clip couldn't be written down (⚑ Q338 hint)
  const box = useRef(0); // bumped when the box starts over: a clip written down for an older box is dropped
  const rec = useRecord(writeDown, SAY_CLIP_MAX_MS);
  const [phase, setPhase] = useState<Phase>('closed');
  const [typed, setTyped] = useState('');
  const [before, setBefore] = useState<string | null>(null); // Clarify: what was said before
  const [reading, setReading] = useState<SayReading | null>(null);
  const [form, setForm] = useState<SayReminder | null>(null);
  const [eventForm, setEventForm] = useState<SayEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FeatureRequest | null>(null); // offered Build now (⚑ Q344)
  const [building, setBuilding] = useState(false);

  const hint = rec.unavailable || rec.refused || unwritten;

  // ⚑ Q378 — the clip, written down, goes after what the box holds by then.
  async function writeDown(clip: Blob) {
    const at = box.current;
    setWriting(true); setUnwritten(false);
    try {
      const r = await upload<{ text: string }>('POST', '/say/hear', clip);
      if (box.current !== at) return;
      if (r.text) setTyped((t) => `${t} ${r.text}`.trim()); else setUnwritten(true);
    } catch { if (box.current === at) setUnwritten(true); }
    finally { setWriting(false); }
  }
  function fill(text: string) { box.current++; rec.cancel(); setTyped(text); setUnwritten(false); setWriting(false); }
  function begin() { stopSpeaking(); setError(null); setPhase('listen'); fill(''); }
  const edit = (text: string) => setTyped(text);
  const open = () => { setBefore(null); setReading(null); begin(); };
  // ⚑ Q360 — the Ensō mark: a tap records, the next tap stops and writes it down; after a refusal a tap tries again.
  function talk() {
    if (rec.recording) { rec.stop(); return; }
    if (rec.unavailable) return;
    (document.activeElement as HTMLElement | null)?.blur(); // the keyboard's own 🎤 would hold the mic
    stopSpeaking(); setUnwritten(false); void rec.start();
  }
  const logged = useRef(false); // an outside answer is logged once
  function close() {
    box.current++; rec.cancel(); stopSpeaking(); setPhase('closed');
    if (phase === 'answer' && reading?.kind === 'outside' && !logged.current) {
      logged.current = true;
      post('/feature-requests', { text: reading.heard, ...reading.request, outside: true }).catch((e) => setError(errorText(e)));
    }
  }

  async function send() {
    unlockSpeech(); // on the Done tap, never while recording: the voice and the mic don't share the phone at once
    const said = typed.trim();
    if (!said) { setError('Say or type what you want first.'); return; }
    const text = before ? clarified(before, said) : said;
    setPhase('reading'); setError(null);
    try {
      const r = await post<SayReading>('/say', { text });
      logged.current = false; setReading(r); setPhase('answer'); speak(r.say);
    } catch (e) { setError(errorText(e)); setPhase('listen'); setTyped(said); }
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
  function fixWords() { const heard = reading?.heard ?? ''; begin(); setBefore(null); setReading(null); fill(heard); } // ⚑ Q361

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
              <span className={s.listening}>{rec.recording ? '🎤 Recording… tap Ensō to stop.' : writing ? 'Writing it down…' : hint ? 'Tap the 🎤 on your keyboard and talk.' : 'Tap Ensō to talk, or type.'}</span>
              <textarea aria-label="What you want" rows={4} autoFocus={rec.unavailable} value={typed} maxLength={SAY_TEXT_MAX}
                placeholder="Weekdays 8 to 11, remind me to book the car check" onChange={(e) => edit(e.target.value)} />
            </div>
          )}
          {phase === 'listen' && isAdmin(me) && <button className="plain" onClick={() => setRequests(true)}>💡 Requests</button>}
          {phase === 'reading' && <p className={s.listening}>Ensō is thinking…</p>}
          {phase === 'answer' && reading && (
            <div aria-live="polite">
              <p className={s.say}><b>You want:</b> {reading.want}</p>
              <p style={{ margin: '8px 0 4px' }}><b>I'll do:</b></p>
              <ol className={s.steps}>{reading.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
              <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>I heard: {reading.heard}</p>
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
      <button className="primary" onClick={send} disabled={!typed.trim() || rec.recording || writing}>Done</button>
      <button onClick={() => fill('')}>🗑 Clear</button>
      <button onClick={close}>Cancel</button>
      <button type="button" className={`${s.talk} ${rec.recording ? s.on : ''}`} onClick={talk} disabled={writing}
        aria-pressed={rec.recording} aria-label={rec.recording ? 'Stop recording' : 'Talk'}>
        <img src="/icon.svg" alt="" draggable={false} />
      </button>
    </>;
    if (phase === 'answer' && reading?.kind === 'outside') return <>
      <button className="primary" onClick={close}>OK</button>
      <button onClick={clarify}>Clarify</button>
      <button onClick={fixWords}>✏️ Edit</button>
    </>;
    if (phase === 'answer') return <>
      <button className="primary" onClick={yes}>Yes</button>
      <button onClick={clarify}>Clarify</button>
      <button onClick={close}>Cancel</button>
      <button onClick={fixWords}>✏️ Edit</button>
    </>;
    if (phase === 'saved' && saved) return <>
      <button className="primary" onClick={buildNow}>Build now</button>
      <button onClick={close}>Later</button>
    </>;
    if (phase === 'saved') return <button className="primary" onClick={close}>OK</button>;
    return <button onClick={close}>Cancel</button>;
  }
}
