// SPEC §8.15b — Chores → 🪙 Bounties: Waiting for OK (admins: OK / Not yet / who), the one-offs with I'll do it /
// Done (BountyDone, with an optional photo) / Let it go and an admin's ✕ Delete, the done photo's thumbnail and 📷 on my
// own pending row, ＋ Bounty (BountyForm), and Chore bounties (admins: None, 1–10, saved at
// once). Which buttons show follows takeError / doneError, the server's own rules. useBounties is shared with Score.
import { useEffect, useState } from 'react';
import { BountyForm, POINT_CHOICES } from './BountyForm';
import { BountyDone } from './BountyDone';
import { Thumb } from './PhotoField';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';
import type { Chore } from './Chores';
import { apiUrl, del, errorText, get, post, put, upload } from '../api';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { utcToLocal } from '../../../src/shared/time';
import { doneError, takeError, type Bounty, type Earning, type Score } from '../../../src/shared/bounties';
import s from './Lists.module.css';

export interface BountiesData { bounties: Bounty[]; waiting: Earning[]; scores: Score[] }

/** GET /bounties, again on every refresh. */
export function useBounties() {
  const { version } = useApp();
  const [data, setData] = useState<BountiesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<BountiesData>('/bounties').then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);
  return { data, error };
}

export function BountiesSection({ chores }: { chores: Chore[] | null }) {
  const { me, members, memberById, localTime, today, tz, refresh } = useApp();
  const { data, error: loadError } = useBounties();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState<Bounty | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // ⚑ Q259: a fresh ?v= after an upload
  const photoPick = usePhotoPick(async ([f]) => {
    const id = photoFor;
    if (id) await act(id, async () => upload('PUT', `/earnings/${id}/photo`, await shrinkPicked(f)));
    setNonce(Date.now());
  });
  const [who, setWho] = useState<Record<string, string>>({});
  const admin = isAdmin(me);
  const name = (id: string | null) => (id === me.id ? 'You' : (id && memberById(id)?.displayName) || 'Someone');
  const when = (iso: string) => (utcToLocal(iso, tz).date === today() ? localTime(iso) : new Date(iso).toLocaleDateString(undefined, { weekday: 'short', timeZone: tz }));
  const active = members.filter((m) => !m.disabledAt);

  async function act(key: string, call: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await call(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); refresh(); }
  }

  const myDib = data?.bounties.find((b) => b.status === 'taken' && b.takenBy === me.id) ?? null;
  const row = (b: Bounty) => {
    const taker = name(b.takenBy);
    const canTake = b.takenBy !== me.id && !takeError(b.status, b.takenBy, me.id, taker, myDib && myDib.id !== b.id ? myDib.title : null);
    const canDone = !doneError(b.status, b.takenBy, me.id, taker);
    return (
      <li key={b.id} className={s.row}>
        <div className={`${s.item} ${s.main}`} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className={s.title}>{b.title} · 🪙 {b.points}</span>
          {b.note && <span className="muted">{b.note}</span>}
          {b.status === 'taken' && <span className="muted">{b.takenBy === me.id ? 'You\'re on it' : `${taker} is on it`}</span>}
          {b.status === 'pending' && <span className="muted">Done by {name(b.doneBy)}, waiting for OK</span>}
        </div>
        {canTake && <button disabled={busy === b.id} onClick={() => act(b.id, () => post(`/bounties/${b.id}/take`))}>I'll do it</button>}
        {canDone && <button className="primary" disabled={busy === b.id} onClick={() => setFinishing(b)}>Done</button>}
        {b.status === 'taken' && b.takenBy === me.id && (
          <button disabled={busy === b.id} onClick={() => act(b.id, () => post(`/bounties/${b.id}/let-go`))}>Let it go</button>
        )}
        {admin && (
          <button className="plain" aria-label={`Delete ${b.title}`} title={`Delete ${b.title}`} disabled={busy === b.id}
            onClick={() => { if (confirm(`Delete ${b.title}?`)) act(b.id, () => del(`/bounties/${b.id}`)); }}>✕</button>
        )}
      </li>
    );
  };

  const waiting = (e: Earning) => {
    const pick = who[e.id] ?? e.memberId;
    return (
      <li key={e.id} className={s.row}>
        <div className={`${s.item} ${s.main}`} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className={s.title}>{e.title}{e.kind === 'chore' && <span className="muted"> (chore)</span>} · {e.points} · {name(e.memberId)} · {when(e.doneAt)}</span>
          {e.hasPhoto && <Thumb src={`${apiUrl(`/earnings/${e.id}/photo`)}?v=${nonce}`} alt={`The finished job: ${e.title}`} />}
        </div>
        {e.memberId === me.id && (
          <button disabled={busy === e.id} onClick={() => { setPhotoFor(e.id); photoPick.open(); }}>📷 {e.hasPhoto ? 'Replace photo' : 'Add photo'}</button>
        )}
        {admin && <>
          <select aria-label={`Who did ${e.title}`} value={pick} onChange={(x) => setWho({ ...who, [e.id]: x.target.value })}>
            {[...active].sort((x, y) => Number(y.id === e.memberId) - Number(x.id === e.memberId))
              .map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
          <button className="primary" disabled={busy === e.id} onClick={() => act(e.id, () => post(`/earnings/${e.id}/ok`, { memberId: pick }))}>OK</button>
          <button disabled={busy === e.id} onClick={() => act(e.id, () => post(`/earnings/${e.id}/not-yet`))}>Not yet</button>
        </>}
      </li>
    );
  };

  const shownError = error ?? loadError;
  return (
    <>
      {shownError && <div role="alert" className="alert-error">{shownError}</div>}
      {!data && !shownError && <p className="muted">Loading…</p>}
      {data && data.waiting.length > 0 && (
        <section className={s.section} aria-label="Waiting for OK">
          <h2>Waiting for OK</h2>
          <ul className={s.list}>{data.waiting.map(waiting)}</ul>
        </section>
      )}
      {data && (
        <section className={s.section} aria-label="Bounties">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ flex: 1, marginBottom: 0 }}>Bounties</h2>
            {admin && <button onClick={() => setAdding(true)}>＋ Bounty</button>}
          </div>
          {data.bounties.length === 0 ? <p className="muted">No bounties right now.</p> : <ul className={s.list}>{data.bounties.map(row)}</ul>}
        </section>
      )}
      {admin && !!chores?.length && (
        <section className={s.section} aria-label="Chore bounties">
          <h2>Chore bounties</h2>
          <p className="muted" style={{ fontSize: '.85rem' }}>Whoever finishes a run earns these points.</p>
          <ul className={s.list}>
            {chores.map((c) => (
              <li key={c.id} className={s.row}>
                <div className={`${s.item} ${s.main}`}><span className={s.title}>{c.title}</span></div>
                <select aria-label={`Bounty for ${c.title}`} value={c.bounty ?? ''} disabled={busy === c.id}
                  onChange={(e) => act(c.id, () => put(`/chores/${c.id}/bounty`, { points: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">None</option>
                  {POINT_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
      {photoPick.input}
      {adding && <BountyForm onClose={() => setAdding(false)} />}
      {finishing && <BountyDone bounty={finishing} onClose={() => setFinishing(null)} />}
    </>
  );
}
