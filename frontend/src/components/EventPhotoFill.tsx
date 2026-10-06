// SPEC §7.8, §8.4 — "📷 Fill in from a screenshot" in the new-event form: pick and shrink a picture, POST
// /events/read-photo, then readingToForm against the form as it opened. Hands the filled fields to the form;
// holds no form state, never saves, keeps no photo.
import { useRef, useState } from 'react';
import { errorText, upload } from '../api';
import { readingToForm, type EventFill, type EventReading } from '../../../src/shared/event-reading';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';

interface Props<F extends EventFill> {
  form: F;
  /** The form as it opened: only fields still equal to it are filled. */
  opened: EventFill;
  onFill: (form: F) => void;
}

export function EventPhotoFill<F extends EventFill>({ form, opened, onFill }: Props<F>) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const latest = useRef(form); // what was typed while the screenshot was being read is kept
  latest.current = form;
  const { input, open } = usePhotoPick(([file]) => read(file));

  async function read(file: File) {
    setBusy(true); setSaid(null);
    try {
      const reading = await upload<EventReading>('POST', '/events/read-photo', await shrinkPicked(file));
      const { form: next, filled } = readingToForm(latest.current, opened, reading);
      onFill(next);
      setSaid(filled ? `Filled ${filled} field${filled > 1 ? 's' : ''} from the screenshot — check them.` : 'Nothing new to fill in from the screenshot.');
    } catch (e) {
      setSaid(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      {input}
      <button type="button" style={{ width: '100%', minHeight: 44 }} disabled={busy} onClick={open}>
        {busy ? 'Reading the screenshot…' : '📷 Fill in from a screenshot'}
      </button>
      {said && <p className="muted" role="status" style={{ marginTop: 4 }}>{said}</p>}
    </div>
  );
}
