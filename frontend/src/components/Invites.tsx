// SPEC §8.9 — Settings → 👥 Members → Invites: create (opens the invite card), list with states, revoke.
import { useEffect, useState } from 'react';
import { del, get, post } from '../api';
import { useAction } from './useAction';
import { InviteCard, untilDate } from './InviteCard';
import s from './Lists.module.css';

interface Invite { id: string; displayName: string; createdAt: string; expiresAt: string; usedAt: string | null; usedBy: string | null; revokedAt: string | null }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** §8.9 — waiting (with expiry) · joined (with the date) · expired · revoked. */
function stateOf(i: Invite, now: number): { text: string; mood: string; waiting: boolean } {
  if (i.usedAt) return { text: `joined ${shortDate(i.usedAt)}`, mood: 'good', waiting: false };
  if (i.revokedAt) return { text: 'revoked', mood: 'neutral', waiting: false };
  if (Date.parse(i.expiresAt) <= now) return { text: 'expired', mood: 'neutral', waiting: false };
  return { text: `waiting · until ${untilDate(i.expiresAt)}`, mood: 'warn', waiting: true };
}

export function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [card, setCard] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
  const [inviteName, setInviteName] = useState('');
  const { run, busy, errorEl } = useAction();
  const refresh = async () => setInvites(await get('/invites'));
  useEffect(() => { run(refresh); }, []);
  const now = Date.now();

  const create = () => run(async () => {
    const name = inviteName.trim();
    const r = await post('/invites', { displayName: name });
    setCard({ name, code: r.code, expiresAt: r.expiresAt }); setInviteName(''); await refresh();
  });
  const revoke = (i: Invite) => {
    if (!confirm(`Revoke the invite for ${i.displayName}? Its link and code will stop working.`)) return;
    run(async () => { await del(`/invites/${i.id}`); await refresh(); });
  };

  return (
    <>
      {errorEl}
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 6px' }}>Invite someone</h3>
      <form className="row" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input aria-label="Name of person to invite" placeholder="Their name…" value={inviteName} maxLength={60} onChange={(e) => setInviteName(e.target.value)} />
        <button type="submit" className="primary" disabled={busy || !inviteName.trim()}>Invite</button>
      </form>
      {invites.length > 0 && (
        <table className={s.table} style={{ marginTop: 8 }}>
          <thead><tr><th scope="col">Invite</th><th scope="col">State</th><th scope="col"><span className="visually-hidden">Revoke</span></th></tr></thead>
          <tbody>
            {invites.map((i) => {
              const st = stateOf(i, now);
              // The member's name when it differs rides in the flexible cell, so a long one truncates instead of widening the row.
              const joinedAs = i.usedBy && i.usedBy !== i.displayName ? i.usedBy : null;
              return (
                <tr key={i.id}>
                  <th scope="row" className={s.flexible} title={joinedAs ? `${i.displayName} — joined as ${joinedAs}` : i.displayName}>
                    {i.displayName}{joinedAs && <span className="muted"> <span aria-hidden>→</span><span className="visually-hidden">joined as</span> {joinedAs}</span>}
                  </th>
                  <td className={s.rigid}><span className={`badge ${st.mood}`}>{st.text}</span></td>
                  <td className={s.rigid}>{st.waiting && <button disabled={busy} onClick={() => revoke(i)}>Revoke</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {card && <InviteCard {...card} onClose={() => setCard(null)} />}
    </>
  );
}
