// SPEC §7.8, §7.9, §7.9a, §8.4 — the event form's fill bar: 📷 Screenshot (pick and shrink a picture, POST
// /events/read-photo) and 📋 Paste (the clipboard's picture the same way, its text or link to /events/read-text). A new
// event fills by readingToForm against the form as it opened; an existing one is updated by readingOverForm.
// Hands the result to the form; holds no form state, never saves, keeps no photo or text.
import { useRef, useState } from 'react';
import { errorText, post, upload } from '../api';
import { EVENT_TEXT_MAX, readingOverForm, readingToForm, type EventFill, type EventReading } from '../../../src/shared/event-reading';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';

interface Props<F extends EventFill> {
  form: F;
  /** The form as it opened (a new event: only fields still equal to it fill), or null for an existing event (§7.9a). */
  opened: EventFill | null;
  onFill: (form: F) => void;
}

/** An item's text (§7.9): text/plain, else the first link of text/uri-list (an iPhone's copied link), else text/html's text. */
async function itemText(item: ClipboardItem): Promise<string> {
  const read = async (type: string) => (item.types.includes(type) ? (await item.getType(type)).text() : '');
  const plain = (await read('text/plain')).trim();
  if (plain) return plain;
  const link = (await read('text/uri-list')).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  if (link) return link;
  const html = await read('text/html');
  return html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() : '';
}

/** What the clipboard holds: a picture first, else its text; null when the phone won't say. */
async function clipboard(): Promise<{ image: Blob | null; text: string } | null> {
  try {
    if (!navigator.clipboard?.read) return { image: null, text: await navigator.clipboard.readText() };
    let text = '';
    for (const item of await navigator.clipboard.read()) {
      const image = item.types.find((t) => t.startsWith('image/'));
      if (image) return { image: await item.getType(image), text: '' };
      text ||= await itemText(item);
    }
    if (!text) text = await navigator.clipboard.readText().catch(() => '');
    return { image: null, text };
  } catch {
    return null;
  }
}

export function EventFillBar<F extends EventFill>({ form, opened, onFill }: Props<F>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const latest = useRef(form); // what was typed while it was being read is kept
  latest.current = form;
  const { input, open } = usePhotoPick(([file]) => read('the screenshot', async () =>
    upload<EventReading>('POST', '/events/read-photo', await shrinkPicked(file))));

  async function read(from: string, ask: () => Promise<EventReading>) {
    setBusy(`Reading ${from}…`); setSaid(null);
    try {
      const reading = await ask();
      const { form: next, filled } = opened ? readingToForm(latest.current, opened, reading) : readingOverForm(latest.current, reading);
      onFill(next);
      const n = `${filled} field${filled > 1 ? 's' : ''} from ${from}`;
      setSaid(!filled ? `Nothing new in ${from}.` : opened ? `Filled ${n} — check them.` : `Updated ${n} — check them, then Save.`);
    } catch (e) {
      setSaid(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function paste() {
    const got = await clipboard();
    if (!got) return setSaid("Couldn't read the clipboard — copy it again, or type it in.");
    const text = got.text.trim().slice(0, EVENT_TEXT_MAX);
    if (!got.image && !text) return setSaid('Nothing to paste — copy a message, an address or a screenshot first.');
    await read('what you copied', async () => got.image
      ? upload<EventReading>('POST', '/events/read-photo', await shrinkPicked(got.image))
      : post<EventReading>('/events/read-text', { text }));
  }

  return (
    <div className="field">
      {input}
      <div className="row">
        <button type="button" style={{ flex: 1, minHeight: 44 }} disabled={!!busy} onClick={open}>📷 Screenshot</button>
        <button type="button" style={{ flex: 1, minHeight: 44 }} disabled={!!busy} onClick={paste}>📋 Paste</button>
      </div>
      {(busy || said) && <p className="muted" role="status" style={{ marginTop: 4 }}>{busy ?? said}</p>}
    </div>
  );
}
