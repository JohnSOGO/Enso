// SPEC §6.6, §8.13 — the approve page a sign-in request's push opens: /approve-login#{id}. A full page: the
// waiting browser, a rough place and the time, three numbers and "This wasn't me". Every outcome shows in place.
import { useEffect, useState } from 'react';
import { ApiError, errorText, get, post } from '../api';
import { APPROVE_LOGIN_PATH } from '../../../src/shared/phone-login';
import type { LoginView } from '../../../src/shared/vocab';

const KEY = 'enso.approveLogin';

/**
 * Called once by App at start. On the approve page: the id moves from the fragment into sessionStorage (so it
 * survives signing in first, or a reload) and the fragment leaves the address bar. → the id kept, or null.
 */
export function keepApproveRequest(): string | null {
  if (location.pathname !== APPROVE_LOGIN_PATH) return null;
  const fromHash = location.hash.slice(1).trim();
  try { if (fromHash) sessionStorage.setItem(KEY, fromHash); } catch { /* storage may be blocked; the id is still returned */ }
  let id: string | null = fromHash || null;
  if (!id) { try { id = sessionStorage.getItem(KEY); } catch { id = null; } }
  history.replaceState(null, '', id ? APPROVE_LOGIN_PATH : '/');
  return id;
}

/** Done: forget the id and leave the approve page. */
export function forgetApproveRequest() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
  history.replaceState(null, '', '/');
}

interface LoginRequest { id: string; browser: string; place: string; createdAt: string; expiresAt: string; status: LoginView; choices: number[] }
type View = { kind: 'loading' } | { kind: 'ask'; req: LoginRequest } | { kind: 'said'; text: string } | { kind: 'failed'; message: string };

const SAID = {
  approved: 'Done — that screen is signing in now.',
  wrong: "That wasn't the number on the screen, so the sign-in was refused. If it was you, start again there.",
  refused: 'Refused — nobody was signed in.',
  answered: 'This request was already answered.',
  expired: 'This request has expired.',
  gone: "This sign-in request isn't for you, or it is gone.",
};
/** A refusal from the server, as the screen says it; null when it is not one of ours. */
const refusalText = (e: unknown) => !(e instanceof ApiError) ? null
  : e.code === 'not_found' ? SAID.gone : e.code === 'not_pending' ? SAID.answered : e.code === 'expired' ? SAID.expired : null;
/** A request that is no longer pending, opened later. */
const OVER: Record<Exclude<LoginView, 'pending'>, string> = { approved: SAID.approved, denied: SAID.answered, expired: SAID.expired };

const card = { width: 'min(380px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 } as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ApproveLogin({ id, onDone }: { id: string; onDone: () => void }) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    get<LoginRequest>(`/auth/phone-login/${encodeURIComponent(id)}`)
      .then((req) => { if (live) setView(req.status === 'pending' ? { kind: 'ask', req } : { kind: 'said', text: OVER[req.status] }); })
      .catch((e) => { if (live) setView(refusalText(e) ? { kind: 'said', text: refusalText(e)! } : { kind: 'failed', message: errorText(e) }); });
    return () => { live = false; };
  }, [id, attempt]);

  async function answer(number: number | null) {
    setBusy(true); setError(null);
    try {
      const path = `/auth/phone-login/${encodeURIComponent(id)}/${number === null ? 'deny' : 'approve'}`;
      const r = await post<{ status: 'approved' | 'denied' }>(path, number === null ? {} : { number });
      setView({ kind: 'said', text: r.status === 'approved' ? SAID.approved : number === null ? SAID.refused : SAID.wrong });
    } catch (e) {
      const text = refusalText(e);
      if (text) setView({ kind: 'said', text }); else setError(errorText(e));
    } finally { setBusy(false); }
  }

  const done = <button className="primary" style={{ width: '100%', marginTop: 12 }} onClick={onDone}>Done</button>;

  return (
    <main style={{ height: '100%', overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={card} aria-live="polite">
        <h1 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Ensō</h1>
        {view.kind === 'loading' && <p className="muted" role="status">Checking the sign-in request…</p>}
        {view.kind === 'ask' && (
          <>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Signing in somewhere?</p>
            <p>{view.req.browser}</p>
            <p className="muted" style={{ marginBottom: 14 }}>{view.req.place} · {clock(view.req.createdAt)}</p>
            {error && <div role="alert" className="alert-error">{error}</div>}
            <p style={{ marginBottom: 8 }}>Tap the number shown on that screen:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {view.req.choices.map((n) => (
                <button key={n} className="primary" disabled={busy} onClick={() => answer(n)}
                  style={{ minHeight: 56, fontSize: '1.6rem', fontVariantNumeric: 'tabular-nums' }}>{n}</button>
              ))}
            </div>
            <button style={{ width: '100%', minHeight: 44 }} disabled={busy} onClick={() => answer(null)}>This wasn't me</button>
          </>
        )}
        {view.kind === 'said' && <><p role="status">{view.text}</p>{done}</>}
        {view.kind === 'failed' && (
          <>
            <div role="alert" className="alert-error">Could not check this sign-in request: {view.message}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" style={{ flex: 1 }} onClick={() => { setView({ kind: 'loading' }); setAttempt((n) => n + 1); }}>Try again</button>
              <button style={{ flex: 1 }} onClick={onDone}>Done</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
