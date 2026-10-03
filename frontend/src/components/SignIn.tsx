// SPEC §6, §6.2a — first-run owner setup, login, and signup with a typed or pasted invite code.
import { useEffect, useState, type FormEvent } from 'react';
import { errorText, get, post } from '../api';
import { inviteCodeFrom } from '../../../src/shared/invite-link';
import type { Me } from '../state';

type Mode = 'login' | 'invite' | 'setup';

export function SignIn({ onSignedIn }: { onSignedIn: (m: Me, how?: { joined: boolean }) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [f, setF] = useState({ email: '', password: '', displayName: '', code: '', setupToken: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get('/setup').then((r) => { if (r.needed) setMode('setup'); }).catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const path = mode === 'login' ? '/auth/login' : mode === 'invite' ? '/auth/signup' : '/setup';
      await post(path, mode === 'invite' ? { ...f, code: inviteCodeFrom(f.code) } : f); // a pasted whole link works too
      onSignedIn(await get('/me'), { joined: mode === 'invite' });
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  const field = (key: keyof typeof f, label: string, type = 'text', extra: object = {}) => (
    <label className="field"><span>{label}</span>
      <input type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} required {...extra} />
    </label>
  );

  return (
    <main style={{ height: '100%', overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} style={{ width: 'min(380px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <h1 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Ensō</h1>
        <p className="muted" style={{ marginBottom: 14 }}>
          {mode === 'setup' ? 'First run — create the owner account.' : mode === 'invite' ? 'Join the household with your invite code.' : 'Sign in'}
        </p>
        {error && <div role="alert" className="alert-error">{error}</div>}
        {mode === 'setup' && field('setupToken', 'Setup token (from the server secrets)', 'password', { autoComplete: 'off' })}
        {mode === 'invite' && field('code', 'Invite code or link', 'text', { placeholder: 'XXXX-XXXX-XXXX', autoCapitalize: 'characters', autoComplete: 'off' })}
        {mode !== 'login' && field('displayName', 'Your name', 'text', { maxLength: 60, autoComplete: 'nickname' })}
        {field('email', 'Email', 'email', { autoComplete: 'email' })}
        {field('password', mode === 'login' ? 'Password' : 'Password (10+ characters)', 'password', { autoComplete: mode === 'login' ? 'current-password' : 'new-password', minLength: mode === 'login' ? undefined : 10 })}
        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {mode === 'setup' ? 'Create owner' : mode === 'invite' ? 'Join household' : 'Sign in'}
        </button>
        {mode !== 'setup' && (
          <button type="button" className="plain" style={{ marginTop: 12, color: 'var(--accent)' }} onClick={() => { setError(null); setMode(mode === 'login' ? 'invite' : 'login'); }}>
            {mode === 'login' ? 'I have an invite code' : 'I already have an account'}
          </button>
        )}
      </form>
    </main>
  );
}
