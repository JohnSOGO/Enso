// SPEC §7.9, §8.4 — an event's Address box: the text, 📋 Paste (the clipboard's picture through /events/read-photo,
// its text through /events/read-text; only the reading's location fills the box, ⚑ Q195) and Open in Maps (⚑ Q193).
// value/onChange only; holds no form state, never saves.
import { useState } from 'react';
import { errorText, post, upload } from '../api';
import { EVENT_ADDRESS_MAX } from '../../../src/shared/alert-limits';
import { EVENT_TEXT_MAX, type EventReading } from '../../../src/shared/event-reading';
import { shrinkPicked } from './usePhotoPick';

/** What the clipboard holds: a picture first, else its text; null when the phone won't say. */
async function clipboard(): Promise<{ image: Blob | null; text: string } | null> {
  try {
    if (!navigator.clipboard?.read) return { image: null, text: await navigator.clipboard.readText() };
    let text = '';
    for (const item of await navigator.clipboard.read()) {
      const image = item.types.find((t) => t.startsWith('image/'));
      if (image) return { image: await item.getType(image), text: '' };
      if (!text && item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
    }
    return { image: null, text };
  } catch {
    return null;
  }
}

export function AddressField({ value, onChange }: { value: string; onChange: (address: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function paste() {
    setBusy(true); setSaid(null);
    try {
      const got = await clipboard();
      if (!got) return setSaid("Couldn't read the clipboard — paste into the box instead.");
      const text = got.text.trim().slice(0, EVENT_TEXT_MAX);
      if (!got.image && !text) return setSaid('Nothing to paste — copy an address, a message or a screenshot first.');
      const reading = got.image
        ? await upload<EventReading>('POST', '/events/read-photo', await shrinkPicked(got.image))
        : await post<EventReading>('/events/read-text', { text });
      if (reading.location) onChange(reading.location);
      setSaid(reading.location ? 'Address filled — check it.' : 'No address found in what you copied.');
    } catch (e) {
      setSaid(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label className="field" style={{ marginBottom: 0 }}><span>Address (optional)</span>
        <div className="row">
          <input style={{ flex: 1 }} value={value} maxLength={EVENT_ADDRESS_MAX} onChange={(e) => onChange(e.target.value)} />
          <button type="button" style={{ minHeight: 44 }} disabled={busy} onClick={paste}>{busy ? 'Reading…' : '📋 Paste'}</button>
        </div>
      </label>
      {busy && <p className="muted" role="status" style={{ marginTop: 4 }}>Reading what you copied…</p>}
      {!busy && said && <p className="muted" role="status" style={{ marginTop: 4 }}>{said}</p>}
      {value.trim() && (
        <a href={`https://maps.apple.com/?q=${encodeURIComponent(value.trim())}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4 }}>
          Open in Maps
        </a>
      )}
    </div>
  );
}
