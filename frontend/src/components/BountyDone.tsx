// SPEC §8.15b — the Done sheet on a one-off: 📷 Add photo (optional; the phone offers camera or library, shrunk as a
// thing's photo), then Done → POST /bounties/{id}/done and the photo → PUT /earnings/{earningId}/photo (§7B.8). If the
// photo fails, the Done stands and the refusal shows here. Holds only its draft.
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Thumb } from './PhotoField';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';
import { errorText, post, upload } from '../api';
import { useApp } from '../state';
import type { Bounty } from '../../../src/shared/bounties';

export function BountyDone({ bounty, onClose }: { bounty: Bounty; onClose: () => void }) {
  const { refresh } = useApp();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = usePhotoPick(async ([f]) => {
    try { setPhoto(await shrinkPicked(f)); setError(null); } catch (e) { setError(errorText(e)); }
  });
  useEffect(() => {
    if (!photo) { setSrc(null); return; }
    const url = URL.createObjectURL(photo);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function done() {
    setBusy(true); setError(null);
    let b: Bounty;
    try { b = await post<Bounty>(`/bounties/${bounty.id}/done`); } catch (e) { setError(errorText(e)); setBusy(false); return; }
    try {
      if (photo && b.earningId) await upload('PUT', `/earnings/${b.earningId}/photo`, photo);
      refresh(); onClose();
    } catch (e) {
      setError(`Done, but the photo did not go through: ${errorText(e)} Add it again from Waiting for OK.`);
      refresh();
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Done: ${bounty.title}`} onClose={onClose} error={error}
      footer={<>
        <button className="primary" disabled={busy} onClick={done}>{busy ? 'Sending…' : 'Done'}</button>
        <button onClick={onClose}>Cancel</button>
      </>}>
      <p className="muted">A photo of the finished job lets an admin say OK from anywhere. It is optional.</p>
      {pick.input}
      {src && <Thumb src={src} alt={`The finished job: ${bounty.title}`} />}
      <button type="button" onClick={pick.open}>📷 {photo ? 'Replace photo' : 'Add photo'}</button>
    </Modal>
  );
}
