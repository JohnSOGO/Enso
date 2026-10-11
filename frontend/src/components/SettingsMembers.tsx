// SPEC §8.6, §6.3 — Settings → 👥 Members (admins): the members table (Owner / Admin chip, Make / Remove admin with
// its asks, Disable / Enable); hosts Invites (§8.9).
import { patch } from '../api';
import { useApp } from '../state';
import { ADMIN_ROLE, isAdmin } from '../../../src/shared/roles';
import { useAction } from './useAction';
import { Invites } from './Invites';
import s from './Lists.module.css';

export function SettingsMembers() {
  const { me, members, refresh } = useApp();
  const { run, busy, errorEl } = useAction();
  /** §6.3 — make or remove an admin; asks first, and warns when you are removing yourself. */
  const setAdmin = (id: string, name: string, make: boolean) => {
    const ask = make ? `Make ${name} an admin? They will have the same powers as you, except over the owner.`
      : id === me.id ? 'Remove your own admin role? You will lose these settings straight away.' : `Remove ${name}'s admin role?`;
    if (confirm(ask)) run(async () => { await patch(`/members/${id}`, { role: make ? ADMIN_ROLE : 'member' }); refresh(); });
  };

  return (
    <>
      {errorEl}
      <table className={s.table}>
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col"><span className="visually-hidden">Access</span></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <th scope="row" className={s.flexible} title={m.email}><span style={{ color: m.color }}>●</span> {m.displayName}</th>
              <td className={s.rigid}>
                {m.disabledAt && <span className="badge bad">disabled</span>}{' '}
                {isAdmin(m) && <span className="chip">{m.isFounder ? 'Owner' : 'Admin'}</span>}
              </td>
              <td className={s.rigid}>
                {!m.isFounder && (
                  <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {!m.disabledAt && <button disabled={busy} onClick={() => setAdmin(m.id, m.displayName, !isAdmin(m))}>{isAdmin(m) ? 'Remove admin' : 'Make admin'}</button>}
                    <button disabled={busy} onClick={() => run(async () => { await patch(`/members/${m.id}`, { disabled: !m.disabledAt }); refresh(); })}>
                      {m.disabledAt ? 'Enable' : 'Disable'}
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Invites />
    </>
  );
}
