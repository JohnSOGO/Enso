// SPEC §8.6, §6.3 — Settings → 👥 Members (admins): the members grid, one row of pills per member (name, role,
// Make / Remove admin with its asks, Disable / Enable); hosts Invites (§8.9).
import { patch } from '../api';
import { useApp } from '../state';
import { ADMIN_ROLE, isAdmin } from '../../../src/shared/roles';
import { useAction } from './useAction';
import { Invites } from './Invites';
import s from './SettingsMembers.module.css';

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
      <div className={s.scroll}>
        <div className={s.grid} role="table" aria-label="Members">
          {members.map((m) => (
            <div key={m.id} className={s.row} role="row">
              <span role="rowheader" className={`chip ${s.name}`} title={m.email}>
                <span style={{ color: m.color }}>●</span> {m.displayName}
              </span>
              <span role="cell">
                {m.disabledAt ? <span className="badge bad">Disabled</span>
                  : <span className="chip">{m.isFounder ? 'Owner' : isAdmin(m) ? 'Admin' : 'Member'}</span>}
              </span>
              <span role="cell">
                {!m.isFounder && !m.disabledAt && (
                  <button className={s.pill} disabled={busy} onClick={() => setAdmin(m.id, m.displayName, !isAdmin(m))}>
                    {isAdmin(m) ? 'Remove admin' : 'Make admin'}
                  </button>
                )}
              </span>
              <span role="cell">
                {!m.isFounder && (
                  <button className={s.pill} disabled={busy} onClick={() => run(async () => { await patch(`/members/${m.id}`, { disabled: !m.disabledAt }); refresh(); })}>
                    {m.disabledAt ? 'Enable' : 'Disable'}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Invites />
    </>
  );
}
