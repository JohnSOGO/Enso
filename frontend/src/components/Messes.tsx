// SPEC §8.15a — the Messes section of the 🧹 Chores tab: 📸 Report a mess, Waiting for answers, To talk about (an
// admin records whose it was), and Balances (who owes whom, each pair's owed messes, Paid back / Let it go). The
// server decides who is asked, the state and the balances (§7B.7); who may answer, settle or delete is the shared rule.
import { useCallback, useEffect, useState } from 'react';
import { MessReport } from './MessReport';
import { apiUrl, del, errorText, get, post } from '../api';
import { useApp } from '../state';
import { canDelete, canSettle, isAnswerable, type Balance, type Mess } from '../../../src/shared/messes';
import s from './Messes.module.css';

const NOBODY = 'nobody'; // the "Whose was it?" choice that closes a mess as nobody's

export interface MessesAnswer { messes: Mess[]; balances: Balance[] }
export const messPhotoSrc = (id: string) => apiUrl(`/messes/${id}/photo`);

/** GET /messes, re-read on every app refresh. */
export function useMesses() {
  const { version } = useApp();
  const [data, setData] = useState<MessesAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<MessesAnswer>('/messes').then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);
  return { data, error };
}

/** Runs one mess action, then refreshes the app; a refusal comes back as text. */
export function useMessAction() {
  const { refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(async (id: string, send: () => Promise<unknown>) => {
    setBusy(id); setError(null);
    try { await send(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); refresh(); }
  }, [refresh]);
  return { busy, error, act };
}

/** A mess's photo: a small square; a tap shows it full width on its own line, another tap shrinks it back. */
export function MessPhoto({ m }: { m: Mess }) {
  const [big, setBig] = useState(false);
  if (!m.hasPhoto) return null;
  return (
    <button type="button" className={`plain ${big ? s.big : s.small}`} onClick={() => setBig(!big)}
      aria-label={big ? 'Show the photo smaller' : 'Show the photo full size'} aria-pressed={big}>
      <img src={messPhotoSrc(m.id)} alt={`The mess: ${messWhat(m)}`} />
    </button>
  );
}

/** "Kitchen: pans on the stove" — the chore and the note, whichever are set. */
export const messWhat = (m: Mess) => [m.choreTitle, m.note].filter(Boolean).join(': ') || 'A mess';

/** That was me / Not me — for a mess I am asked about. */
export function AnswerButtons({ m, busy, act }: { m: Mess; busy: boolean; act: ReturnType<typeof useMessAction>['act'] }) {
  return <>
    <button className="primary" disabled={busy} onClick={() => act(m.id, () => post(`/messes/${m.id}/claim`))}>That was me</button>
    <button disabled={busy} onClick={() => act(m.id, () => post(`/messes/${m.id}/deny`))}>Not me</button>
  </>;
}

function MessRow({ m, act, busy, owedView }: { m: Mess; act: ReturnType<typeof useMessAction>['act']; busy: boolean; owedView?: boolean }) {
  const { me, members, memberById, localTime, today, tz } = useApp();
  const name = (id: string | null) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'nobody');
  const admin = me.role === 'owner';
  const date = new Date(m.createdAt).toLocaleDateString(undefined, { timeZone: tz });
  const when = new Date(m.createdAt).toLocaleDateString('en-CA', { timeZone: tz }) === today() ? localTime(m.createdAt) : date;
  const viewer = { id: me.id, admin };
  const decide = (choice: string) => {
    const who = choice === NOBODY ? null : choice;
    if (confirm(who ? `Record that this was ${name(who)}'s?` : 'Close this mess as nobody\'s?')) act(m.id, () => post(`/messes/${m.id}/decide`, { memberId: who }));
  };
  return (
    <li className={s.mess}>
      <MessPhoto m={m} />
      <div className={s.body}>
        <div><b>{messWhat(m)}</b></div>
        <div className="muted">{m.reportedBy === me.id ? 'You' : name(m.reportedBy)} cleaned this up · {when}</div>
        {m.deniedBy.length > 0 && isAnswerable(m.status) && <div className="muted">Not me: {m.deniedBy.map(name).join(', ')}</div>}
        {m.status === 'owed' && <div className="muted">{m.claimedBy === me.id ? 'Yours' : `${name(m.claimedBy)}'s`}{m.assignedBy ? ` (recorded by ${name(m.assignedBy)})` : ''}</div>}
        <div className={s.actions}>
          {m.asked.includes(me.id) && <AnswerButtons m={m} busy={busy} act={act} />}
          {owedView && canSettle(m, viewer) && <>
            <button className="primary" disabled={busy} onClick={() => act(m.id, () => post(`/messes/${m.id}/settle`, { how: 'paid' }))}>Paid back</button>
            <button disabled={busy} onClick={() => act(m.id, () => post(`/messes/${m.id}/settle`, { how: 'forgiven' }))}>Let it go</button>
          </>}
          {admin && (
            <select aria-label="Whose was it?" value="pick" disabled={busy} onChange={(e) => { if (e.target.value !== 'pick') decide(e.target.value); }}>
              <option value="pick" hidden>Whose was it?</option>
              {members.filter((x) => !x.disabledAt && x.id !== m.reportedBy).map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
              <option value={NOBODY}>Nobody's</option>
            </select>
          )}
          {canDelete(m, viewer) && (
            <button className="plain" aria-label="Delete this mess" title="Delete this mess" disabled={busy}
              onClick={() => { if (confirm('Delete this mess?')) act(m.id, () => del(`/messes/${m.id}`)); }}>✕</button>
          )}
        </div>
      </div>
    </li>
  );
}

export function MessesSection() {
  const { me, memberById } = useApp();
  const { data, error } = useMesses();
  const { busy, error: actError, act } = useMessAction();
  const [reporting, setReporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const name = (id: string) => (id === me.id ? 'you' : memberById(id)?.displayName ?? 'unknown member');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const list = (title: string, rows: Mess[]) => rows.length > 0 && (
    <><h3 className={s.sub}>{title}</h3><ul className={s.list}>{rows.map((m) => <MessRow key={m.id} m={m} act={act} busy={busy === m.id} />)}</ul></>
  );
  const pairKey = (b: Balance) => `${b.from}|${b.to}`;
  const ofPair = (b: Balance) => (data?.messes ?? []).filter((m) => m.status === 'owed'
    && [m.reportedBy, m.claimedBy].includes(b.from) && [m.reportedBy, m.claimedBy].includes(b.to));

  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ flex: 1, marginBottom: 0 }}>Messes</h2>
        <button onClick={() => setReporting(true)}>📸 Report a mess</button>
      </div>
      {(error || actError) && <div role="alert" className="alert-error">{error ?? actError}</div>}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data && <>
        {list('Waiting for answers', data.messes.filter((m) => m.status === 'open'))}
        {list('To talk about', data.messes.filter((m) => m.status === 'discuss'))}
        <h3 className={s.sub}>Balances</h3>
        {data.balances.length === 0 && <p className="muted">Nobody owes anybody.</p>}
        <ul className={s.list}>
          {data.balances.map((b) => (
            <li key={pairKey(b)}>
              <button className={`plain ${s.balance}`} aria-expanded={open === pairKey(b)} onClick={() => setOpen(open === pairKey(b) ? null : pairKey(b))}>
                {cap(name(b.from))} {b.from === me.id ? 'owe' : 'owes'} {name(b.to)} {b.points} <span aria-hidden>{open === pairKey(b) ? '▾' : '▸'}</span>
              </button>
              {open === pairKey(b) && <ul className={s.list}>{ofPair(b).map((m) => <MessRow key={m.id} m={m} act={act} busy={busy === m.id} owedView />)}</ul>}
            </li>
          ))}
        </ul>
      </>}
      {reporting && <MessReport onClose={() => setReporting(false)} />}
    </>
  );
}
