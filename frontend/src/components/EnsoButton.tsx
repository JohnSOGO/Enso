// SPEC §8.18 — the Ensō button and its popup, rendered once by App.tsx: tap, say what you want (or type it), POST
// /say, then what Ensō heard and what it will do, spoken aloud, with Yes / Clarify / Cancel. Yes on a reminder opens
// the reminder form filled in; on a request POST /feature-requests. Renders what the server read; never decides it.
import { useState } from 'react';
import { Modal } from './Modal';
import { ReminderForm } from './Reminders';
import { speak, stopSpeaking, unlockSpeech, useListen } from './useSpeech';
import { errorText, post } from '../api';
import { SAY_TEXT_MAX, clarified, type SayReading, type SayReminder } from '../../../src/shared/say-reading';
import s from './EnsoButton.module.css';

type Phase = 'closed' | 'listen' | 'reading' | 'answer' | 'saved';
const SAVED = 'Saved. Thanks!';

export function EnsoButton() {
  const listen = useListen();
  const [phase, setPhase] = useState<Phase>('closed');
  const [typed, setTyped] = useState('');
  const [before, setBefore] = useState<string | null>(null); // Clarify: what was said before
  const [reading, setReading] = useState<SayReading | null>(null);
  const [form, setForm] = useState<SayReminder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typing = listen.unavailable;
  const words = typing ? typed : listen.words;

  function begin() {
    unlockSpeech(); stopSpeaking(); setError(null); setTyped(''); setPhase('listen');
    if (!listen.unavailable) listen.start();
  }
  const open = () => { setBefore(null); setReading(null); begin(); };
  function close() { listen.stop(); stopSpeaking(); setPhase('closed'); }

  async function send() {
    listen.stop();
    const said = words.trim();
    if (!said) { setError('Say or type what you want first.'); return; }
    const text = before ? clarified(before, said) : said;
    setPhase('reading'); setError(null);
    try {
      const r = await post<SayReading>('/say', { text });
      setReading(r); setPhase('answer'); speak(r.say);
    } catch (e) { setError(errorText(e)); setPhase('listen'); setTyped(said); }
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
      <button className={s.enso} aria-label="Ensō: say what you want" title="Say what you want" onClick={open}>
        <img src="/icon.svg" alt="" />
      </button>
      {phase !== 'closed' && (
        <Modal title="Ensō" onClose={close} error={error} footer={footer()}>
          {before && phase === 'listen' && <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Before: {before}</p>}
          {phase === 'listen' && !typing && (
            <div aria-live="polite">
              <p className={s.listening}>{listen.listening ? '🎤 Listening…' : '🎤 Tap Done to send, or Cancel.'}</p>
              <p className={s.words}>{listen.words || <span className="muted">Say what you want, like “Weekdays 8 to 11, remind me to book the car check.”</span>}</p>
            </div>
          )}
          {phase === 'listen' && typing && (
            <label className="field"><span>Tap the 🎤 on your keyboard and talk.</span>
              <textarea rows={3} autoFocus value={typed} maxLength={SAY_TEXT_MAX} placeholder="Weekdays 8 to 11, remind me to book the car check"
                onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
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
      {form && <ReminderForm reminder={null} start={form} onClose={() => setForm(null)} />}
    </>
  );

  function footer() {
    if (phase === 'listen') return <>
      <button className="primary" onClick={send} disabled={!words.trim()}>{typing ? 'Send' : 'Done'}</button>
      <button onClick={close}>Cancel</button>
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
