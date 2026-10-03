// SPEC §8.9 — the one-time invite card: QR of the link, Share…, Copy link, the code. The only importer of `uqr`,
// and only lazily (§2.1), so the QR library never rides in the main bundle.
import { useEffect, useState } from 'react';
import { inviteLink } from '../../../src/shared/invite-link';
import { Modal } from './Modal';
import s from './InviteCard.module.css';

/** "Sat Oct 10" — an invite's expiry, as the card and the invites list show it. */
export const untilDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const CLOSE_TEXT = 'Close the invite card? The link and code are shown only once — they cannot be shown again.';
const QR_PX = 240;

type Qr = { size: number; path: string } | 'loading' | 'failed';

export function InviteCard({ name, code, expiresAt, onClose }: { name: string; code: string; expiresAt: string; onClose: () => void }) {
  const link = inviteLink(location.origin, code);
  const [qr, setQr] = useState<Qr>('loading');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    import('uqr')
      .then(({ encode }) => {
        const { size, data } = encode(link, { ecc: 'M', border: 4 }); // 4-module white quiet zone
        let path = '';
        data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z`; }));
        if (live) setQr({ size, path });
      })
      .catch((e) => { console.warn('QR library failed to load', e); if (live) setQr('failed'); });
    return () => { live = false; };
  }, [link]);

  useEffect(() => {
    if (copy !== 'copied') return;
    const t = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(t);
  }, [copy]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard'); // plain-HTTP LAN address: no clipboard API
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      setCopy('manual');
    }
  };

  const share = async () => {
    setError(null);
    try {
      await navigator.share({ text: 'Join our household on Ensō', url: link });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(`Sharing failed (${(e as Error)?.message || 'unknown reason'}). Use Copy link instead.`);
    }
  };

  const close = () => { if (confirm(CLOSE_TEXT)) onClose(); };

  return (
    <Modal title={`Invite for ${name}`} onClose={onClose} dirty confirmCloseText={CLOSE_TEXT} error={error}
      footer={<button onClick={close}>Done</button>}>
      <div className={s.card}>
        {qr === 'loading' && <div className={s.qrSlot} aria-busy="true"><span className="muted">Drawing QR code…</span></div>}
        {qr === 'failed' && (
          <div className={s.qrSlot} role="status"><span className="muted">QR unavailable — share or copy the link, or give them the code below.</span></div>
        )}
        {typeof qr === 'object' && (
          <svg className={s.qr} width={QR_PX} height={QR_PX} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges"
            role="img" aria-label={`QR code of the invite link for ${name}`}>
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#000" />
          </svg>
        )}
        <p className="muted">Scan with the phone's camera</p>
        <div className={s.actions}>
          {typeof navigator.share === 'function' && <button className="primary" onClick={share}>Share…</button>}
          <button onClick={copyLink}>{copy === 'copied' ? 'Copied' : 'Copy link'}</button>
        </div>
        {copy === 'manual' && (
          <label className="field" style={{ width: '100%' }}>
            <span role="alert">Copying is blocked here — the link is selected, copy it by hand:</span>
            <input readOnly value={link} autoFocus onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <p className="muted">or type on the sign-in page:</p>
        <p className={s.code}>{code}</p>
        <p>Works once · until {untilDate(expiresAt)}</p>
        <p className={s.once}>Shown once — keep this open until they have it.</p>
      </div>
    </Modal>
  );
}
