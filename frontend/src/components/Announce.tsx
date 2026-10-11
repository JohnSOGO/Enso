// SPEC §8.5, §9.3 — the 📢 Announce button at the top of the Alarms tab and its box: a message,
// Phone / House / FunHouse chosen each time, Send → POST /announce. Spoken as "{my name} says: …", now.
import { useState } from 'react';
import { Modal } from './Modal';
import { ChannelChecks, channelsOf, flagsOf } from './AlertFields';
import { errorText, post } from '../api';
import { useIsFounder } from '../state';
import { ANNOUNCE_MAX } from '../../../src/shared/announce';

function AnnounceBox({ onClose }: { onClose: () => void }) {
  // ⚑ Q36: House ticked, Phone unticked, every time the box opens; FunHouse ticked too for the founder (§9.4b Q230).
  const [f, setF] = useState({ text: '', ...flagsOf(useIsFounder() ? ['house', 'funhouse'] : ['house']) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const channels = channelsOf(f);

  async function send() {
    setBusy(true); setError(null);
    try { await post('/announce', { text: f.text, channels }); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="📢 Announce" onClose={onClose} dirty={f.text.trim() !== ''} error={error}
      footer={<>
        <button className="primary" disabled={busy || !f.text.trim() || !channels.length} onClick={send}>Send</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        <label className="field"><span>Message</span>
          <input value={f.text} maxLength={ANNOUNCE_MAX} autoFocus enterKeyHint="send"
            onChange={(e) => setF({ ...f, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && f.text.trim() && channels.length) send(); }} />
        </label>
        <ChannelChecks value={f} onChange={(c) => setF({ ...f, ...c })} />
      </fieldset>
    </Modal>
  );
}

export function Announce() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>📢 Announce</button>
      {open && <AnnounceBox onClose={() => setOpen(false)} />}
    </>
  );
}
