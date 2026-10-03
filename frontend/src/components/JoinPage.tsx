// SPEC §6.2a, §8.9 — the join page at /join#CODE: read and clear the fragment, preview, sign up; a dead link says so.
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorText, get, post } from '../api';
import { JOIN_PATH, inviteCodeFrom } from '../../../src/shared/invite-link';
import type { Me } from '../state';

interface Preview { displayName: string; householdName: string | null; invitedBy: string | null; expiresAt: string }
type View = { kind: 'loading' } | { kind: 'form'; preview: Preview } | { kind: 'dead'; invitedBy: string | null } | { kind: 'offline'; message: string };

const card = { width: 'min(380px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 } as const;

export function JoinPage({ onJoined, onSignIn }: { onJoined: (m: Me) => void; onSignIn: () => void }) {
  // Read once, before the effect below wipes the fragment (StrictMode runs effects twice).
  const [code] = useState(() => inviteCodeFrom(location.hash));
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [f, setF] = useState({ displayName: '', email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.hash) history.replaceState(null, '', JOIN_PATH); // the code must not linger in the address bar or history
    if (!code) { setView({ kind: 'dead', invitedBy: null }); return; }
    let live = true;
    post<Preview>('/auth/invite-preview', { code })
      .then((p) => { if (!live) return; setView({ kind: 'form', preview: p }); setF((x) => ({ ...x, displayName: x.displayName || p.displayName })); })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.code === 'invalid_code') setView({ kind: 'dead', invitedBy: null });
        else setView({ kind: 'offline', message: errorText(e) });
      });
    return () => { live = false; };
  }, [code, attempt]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await post('/auth/signup', { code, ...f });
      onJoined(await get('/me'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_code' && view.kind === 'form') setView({ kind: 'dead', invitedBy: view.preview.invitedBy });
      else setError(errorText(err));
    } finally { setBusy(false); }
  }

  const signInButton = (
    <button type="button" className="plain" style={{ marginTop: 12, color: 'var(--accent)' }} onClick={onSignIn}>Sign in</button>
  );

  return (
    <main style={{ height: '100%', overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 16 }}>
      {view.kind === 'loading' && <p className="muted" role="status">Checking your invite…</p>}

      {view.kind === 'offline' && (
        <div style={card}>
          <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Ensō</h1>
          <div role="alert" className="alert-error">Could not check this invite: {view.message}</div>
          <button className="primary" style={{ width: '100%' }} onClick={() => { setView({ kind: 'loading' }); setAttempt((n) => n + 1); }}>Try again</button>
        </div>
      )}

      {view.kind === 'dead' && (
        <div style={card}>
          <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Ensō</h1>
          <p role="alert">
            This invite link doesn't work any more — it may have been used, expired or been cancelled.
            Ask {view.invitedBy ?? 'the person who invited you'} for a new one.
          </p>
          <p className="muted" style={{ marginTop: 12 }}>Already joined?</p>
          {signInButton}
        </div>
      )}

      {view.kind === 'form' && (
        <form onSubmit={submit} style={card}>
          <h1 style={{ fontSize: '1.2rem', marginBottom: 4, textAlign: 'center' }}>Ensō</h1>
          <p className="muted" style={{ textAlign: 'center' }}>
            {view.preview.invitedBy ? `${view.preview.invitedBy} invited you to join` : 'You are invited to join'}
          </p>
          <p style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 700, marginBottom: 14 }}>{view.preview.householdName ?? 'the household'}</p>
          {error && <div role="alert" className="alert-error">{error}</div>}
          <label className="field"><span>Your name</span>
            <input value={f.displayName} maxLength={60} autoComplete="nickname" required onChange={(e) => setF({ ...f, displayName: e.target.value })} />
          </label>
          <label className="field"><span>Email</span>
            <input type="email" value={f.email} autoComplete="email" required onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>Password (10+ characters)</span>
              <input type={showPw ? 'text' : 'password'} value={f.password} autoComplete="new-password" minLength={10} required
                onChange={(e) => setF({ ...f, password: e.target.value })} />
            </label>
            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} title={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw(!showPw)}>👁</button>
          </div>
          <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            Join {view.preview.householdName ?? 'household'}
          </button>
          <p className="muted" style={{ marginTop: 12 }}>Already have an account?</p>
          {signInButton}
        </form>
      )}
    </main>
  );
}
