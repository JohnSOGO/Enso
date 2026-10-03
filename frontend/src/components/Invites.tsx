// SPEC §8.9 — Settings → Household → Invites: create, list with states, revoke.
import { useEffect, useState } from 'react';
import { del, get, post } from '../api';
import { useAction } from './useAction';
import s from './Lists.module.css';

export function Invites() {
  const [invites, setInvites] = useState<any[]>([]);
  const [newCode, setNewCode] = useState<{ code: string; for: string; expiresAt: string } | null>(null);
  const [inviteName, setInviteName] = useState('');
  const { run, busy, errorEl } = useAction();
  const loadInvites = () => get('/invites').then(setInvites).catch(() => undefined);
  useEffect(() => { loadInvites(); }, []);

  return (
    <>
      {errorEl}
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 6px' }}>Invite someone</h3>
      <div className="row">
        <input aria-label="Name of person to invite" placeholder="e.g. Tostig" value={inviteName} maxLength={60} onChange={(e) => setInviteName(e.target.value)} />
        <button className="primary" disabled={busy || !inviteName.trim()} onClick={() => run(async () => {
          const r = await post('/invites', { displayName: inviteName });
          setNewCode({ code: r.code, for: inviteName, expiresAt: r.expiresAt }); setInviteName(''); loadInvites();
        })}>Create code</button>
      </div>
      {newCode && (
        <div className="alert-error" style={{ background: 'rgba(99,102,241,.15)', borderColor: 'var(--accent)', color: 'var(--text)' }} role="status">
          Code for {newCode.for}: <b style={{ fontSize: '1.2rem', letterSpacing: 1, userSelect: 'all' }}>{newCode.code}</b>
          <br /><span className="muted">Shown only once. Expires {new Date(newCode.expiresAt).toLocaleDateString()}. They enter it on the sign-in page under “I have an invite code”.</span>
        </div>
      )}
      {invites.length > 0 && (
        <table className={s.table} style={{ marginTop: 8 }}>
          <thead><tr><th scope="col">Invite</th><th scope="col">State</th><th scope="col"><span className="visually-hidden">Revoke</span></th></tr></thead>
          <tbody>
            {invites.map((i) => {
              const state = i.usedAt ? `used by ${i.usedBy}` : i.revokedAt ? 'revoked' : Date.parse(i.expiresAt) < Date.now() ? 'expired' : 'open';
              return (
                <tr key={i.id}>
                  <th scope="row" className={s.flexible}>{i.displayName}</th>
                  <td className={s.rigid}><span className={`badge ${state === 'open' ? 'warn' : 'neutral'}`}>{state}</span></td>
                  <td className={s.rigid}>{state === 'open' && <button disabled={busy} onClick={() => run(async () => { await del(`/invites/${i.id}`); loadInvites(); })}>Revoke</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
