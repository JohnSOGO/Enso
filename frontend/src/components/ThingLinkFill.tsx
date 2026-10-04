// SPEC §7C.4b, §8.11 — "Fill in from this link" under the thing form's Link field: POST /things/read-link
// with the field's link, "Reading the link…" while it runs, then what it filled or why it couldn't. The
// reading goes to the form, which fills only empty fields and marks them; nothing is saved here.
import { useState } from 'react';
import { errorText, post } from '../api';
import { webLink, type PhotoReading } from '../../../src/shared/things';

interface Props {
  /** The Link field as typed. */
  url: string;
  /** Fills the form's empty fields; returns how many it filled. */
  onReading: (r: PhotoReading) => number;
}

export function ThingLinkFill({ url, onReading }: Props) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const link = webLink(url);
  if (!link && !said) return null;

  async function read() {
    setBusy(true); setSaid(null);
    try {
      const n = onReading(await post<PhotoReading>('/things/read-link', { url: link }));
      setSaid(n ? `Filled ${n} empty field${n > 1 ? 's' : ''} from the link — check them.` : 'Nothing new found at that link.');
    } catch (e) {
      setSaid(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      {link && (
        <button type="button" style={{ width: '100%', minHeight: 44 }} disabled={busy} onClick={read}>
          {busy ? 'Reading the link…' : '🔗 Fill in from this link'}
        </button>
      )}
      {said && <p className="muted" role="status" style={{ marginTop: 4 }}>{said}</p>}
    </div>
  );
}
