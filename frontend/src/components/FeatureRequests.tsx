// SPEC §8.18, §8.6 — Settings → 💡 Requests (admins): what the Ensō button saved for the next build, newest first,
// with OK to build (the founder, on Needs John or Out of scope) and Dismiss (any admin, on an open or Out of scope one). Shows the server's status.
import { useEffect, useState } from 'react';
import { errorText, get, post } from '../api';
import { useApp, useIsFounder } from '../state';
import { canOk, isListed, type FeatureRequest } from '../../../src/shared/feature-requests';
import type { FeatureRequestStatus } from '../../../src/shared/vocab';
import s from './Lists.module.css';

const BADGE: Record<FeatureRequestStatus, { text: string; cls: string }> = {
  needs_john: { text: 'Needs John', cls: 'badge warn' }, new: { text: 'New', cls: 'badge good' },
  outside: { text: 'Out of scope', cls: 'badge warn' },
  done: { text: 'Done', cls: 'badge neutral' }, dismissed: { text: 'Dismissed', cls: 'badge neutral' },
};

export function FeatureRequests() {
  const { members, version } = useApp();
  const founder = useIsFounder();
  const [list, setList] = useState<FeatureRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get<FeatureRequest[]>('/feature-requests').then((r) => { setList(r); setError(null); }).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, [version]);

  async function act(id: string, what: 'ok' | 'dismiss') {
    setBusy(true);
    try { await post(`/feature-requests/${id}/${what}`); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const who = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'unknown member';

  return (
    <section aria-label="Feature requests">
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>What people asked the Ensō button for that Ensō can't do yet. The next build picks these up; Needs John waits for John's OK. Out of scope is outside what Ensō is for; OK to build widens it.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">No requests yet.</p>}
      {!!list?.length && (
        <ul className={s.list}>
          {list.map((r) => {
            const open = isListed(r.status);
            return (
              <li key={r.id} style={{ opacity: open ? 1 : 0.55, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.title}</b>
                  <span className={BADGE[r.status].cls} style={{ flex: 'none' }}>{BADGE[r.status].text}</span>
                </div>
                <div className="muted" style={{ fontSize: '.8rem' }}>{r.createdAt.slice(0, 10)} · {who(r.createdBy)}{r.note ? ` · ${r.note}` : ''}</div>
                {r.summary && <div style={{ fontSize: '.9rem', marginTop: 2 }}>{r.summary}</div>}
                <div className="muted" style={{ fontSize: '.8rem', marginTop: 2, overflowWrap: 'anywhere' }}>“{r.text}”</div>
                {open && (
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    {founder && canOk(r.status) && <button className="primary" disabled={busy} onClick={() => act(r.id, 'ok')}>OK to build</button>}
                    <button disabled={busy} onClick={() => act(r.id, 'dismiss')}>Dismiss</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
