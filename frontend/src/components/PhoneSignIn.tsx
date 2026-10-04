// SPEC §6.6, §8.13 — the waiting browser's side of "Sign in with my phone": ask, show the match number large,
// poll every ~2 s until the phone approves, refuses, or the request runs out. Hosted by SignIn.tsx.
import { useEffect, useRef, useState } from 'react';
import { errorText, get, post } from '../api';
import type { LoginView } from '../../../src/shared/vocab';
import type { Me } from '../state';

const POLL_MS = 2000;

type View =
  | { kind: 'asking' }
  | { kind: 'waiting'; match: number; expiresAt: string }
  | { kind: 'over'; text: string }
  | { kind: 'failed'; message: string };

const OVER: Partial<Record<LoginView, string>> = {
  denied: 'Refused on your phone — nobody was signed in.',
  expired: 'No answer in 2 minutes.',
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function PhoneSignIn({ email, onSignedIn, onBack }: { email: string; onSignedIn: (m: Me) => void; onBack: () => void }) {
  const [view, setView] = useState<View>({ kind: 'asking' });
  const [attempt, setAttempt] = useState(0);
  const signedIn = useRef(onSignedIn); // a new callback from the host must not start a new request
  signedIn.current = onSignedIn;

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const { status } = await get<{ status: LoginView }>('/auth/phone-login');
        if (!live) return;
        if (status === 'approved') { signedIn.current(await get<Me>('/me')); return; }
        if (status === 'pending') { timer = setTimeout(poll, POLL_MS); return; }
        setView({ kind: 'over', text: OVER[status] ?? `The request ended (${status}).` });
      } catch (e) { if (live) setView({ kind: 'failed', message: errorText(e) }); }
    };
    setView({ kind: 'asking' });
    post<{ match: number; expiresAt: string }>('/auth/phone-login', { email })
      .then((r) => { if (!live) return; setView({ kind: 'waiting', ...r }); timer = setTimeout(poll, POLL_MS); })
      .catch((e) => { if (live) setView({ kind: 'failed', message: errorText(e) }); });
    return () => { live = false; clearTimeout(timer); };
  }, [email, attempt]);

  const again = (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button className="primary" style={{ flex: 1 }} onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      <button style={{ flex: 1 }} onClick={onBack}>Back</button>
    </div>
  );

  return (
    <div aria-live="polite">
      <h1 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Ensō</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Check your phone</p>
      {view.kind === 'asking' && <p className="muted" role="status">Asking your phone…</p>}
      {view.kind === 'waiting' && (
        <>
          <p aria-label={`Your number is ${view.match}`} style={{ fontSize: '4.5rem', fontWeight: 300, textAlign: 'center', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
            {view.match}
          </p>
          <p style={{ textAlign: 'center', marginBottom: 6 }}>Tap {view.match} on your phone to sign in here.</p>
          <p className="muted" role="status" style={{ textAlign: 'center', marginBottom: 12 }}>Waiting… (until {clock(view.expiresAt)})</p>
          <button style={{ width: '100%' }} onClick={onBack}>Cancel</button>
        </>
      )}
      {view.kind === 'over' && <><p role="status">{view.text}</p>{again}</>}
      {view.kind === 'failed' && <><div role="alert" className="alert-error">{view.message}</div>{again}</>}
    </div>
  );
}
