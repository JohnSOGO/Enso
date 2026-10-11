// SPEC §8.6 — Me, Alerts (§9.5), Household (owner), Status.
import { useEffect, useState, type ReactNode } from 'react';
import { get, patch, post } from '../api';
import { useApp, type Status } from '../state';
import { MEMBER_PALETTE, type DeliveryStatus } from '../../../src/shared/vocab';
import { ADMIN_ROLE, isAdmin } from '../../../src/shared/roles';
import { useAction } from './useAction';
import { Invites } from './Invites';
import { OptionalItems } from './OptionalItems';
import { PhoneAlerts } from './PhoneAlerts';
import { HouseSpeakers } from './HouseSpeakers';
import { MyAlerts } from './MyAlerts';
import s from './Lists.module.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={s.section}><h2>{title}</h2>{children}</section>;
}

function MeSection({ onLogout }: { onLogout: () => void }) {
  const { me, refresh } = useApp();
  const [name, setName] = useState(me.displayName);
  const { run, busy, errorEl } = useAction();
  const save = (body: object) => run(async () => { await patch('/me', body); refresh(); });

  return (
    <Section title="Me">
      {errorEl}
      <OptionalItems />
      <label className="field"><span>Display name</span>
        <div className="row"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button disabled={busy || name === me.displayName || !name.trim()} onClick={() => save({ displayName: name })}>Save</button></div>
      </label>
      <div className="field"><span className="muted" style={{ fontSize: '.8rem' }}>My color</span>
        <div className="row wrap" style={{ marginTop: 4 }}>
          {MEMBER_PALETTE.map((c) => (
            <button key={c} aria-label={`Color ${c}`} title={c} disabled={busy} onClick={() => save({ color: c })}
              style={{ background: c, width: 34, height: 34, minHeight: 0, padding: 0, borderRadius: 99, outline: me.color === c ? '3px solid var(--text)' : 'none' }} />
          ))}
        </div>
      </div>
      <PhoneAlerts />
      <HouseSpeakers />
      <button onClick={() => run(async () => { await post('/auth/logout'); onLogout(); })}>Log out</button>
    </Section>
  );
}

function HouseholdSection() {
  const { me, householdName, tz, members, refresh } = useApp();
  const [name, setName] = useState(householdName);
  const [zone, setZone] = useState(tz);
  const { run, busy, errorEl } = useAction();
  /** §6.3 — make or remove an admin; asks first, and warns when you are removing yourself. */
  const setAdmin = (id: string, name: string, make: boolean) => {
    const ask = make ? `Make ${name} an admin? They will have the same powers as you, except over the owner.`
      : id === me.id ? 'Remove your own admin role? You will lose these settings straight away.' : `Remove ${name}'s admin role?`;
    if (confirm(ask)) run(async () => { await patch(`/members/${id}`, { role: make ? ADMIN_ROLE : 'member' }); refresh(); });
  };

  return (
    <Section title="Household">
      {errorEl}
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Household name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" style={{ flex: 1 }}><span>Time zone</span><input value={zone} onChange={(e) => setZone(e.target.value)} /></label>
      </div>
      <button disabled={busy || (name === householdName && zone === tz)} onClick={() => run(async () => { await patch('/settings', { householdName: name, timezone: zone }); refresh(); })}>Save household</button>

      <DaysOff />

      <h3 style={{ fontSize: '.9rem', margin: '16px 0 6px' }}>Members</h3>
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
    </Section>
  );
}

/** Which public holidays this household gets off — they are highlighted yellow on the calendar (SPEC §7.3). */
function DaysOff() {
  const { version, refresh } = useApp();
  const [data, setData] = useState<{ daysOff: string[]; holidays: { key: string; name: string; emoji: string }[] } | null>(null);
  const { run, busy, errorEl } = useAction();
  useEffect(() => { get('/settings').then(setData).catch(() => undefined); }, [version]);
  if (!data) return null;
  const toggle = (key: string, on: boolean) => run(async () => {
    const next = on ? [...data.daysOff, key] : data.daysOff.filter((k) => k !== key);
    setData(await patch('/settings', { daysOff: next }));
    refresh();
  });
  return (
    <>
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 4px' }}>Days off</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Public holidays the household gets off. They show light yellow on the calendar.</p>
      {errorEl}
      <div className="row wrap" role="group" aria-label="Days off">
        {data.holidays.map((h) => (
          <label key={h.key} className="chip" style={{ padding: '4px 8px' }}>
            <input type="checkbox" disabled={busy} checked={data.daysOff.includes(h.key)} onChange={(e) => toggle(h.key, e.target.checked)} /> {h.emoji} {h.name}
          </label>
        ))}
      </div>
    </>
  );
}

const STATUS_BADGE: Record<DeliveryStatus, string> = { sent: 'good', partial: 'warn', failed: 'bad', queued: 'neutral', claimed: 'neutral' };

/** §8.6 ⚑ Q38 — the House line, from the server's `house` as given (§9.2). */
function HouseLine({ house: h, localTime }: { house: Status['house']; localTime: (iso: string) => string }) {
  if (h.state === 'ok') return <span className="badge good">working{h.lastOkAt ? ` · last ${localTime(h.lastOkAt)}` : ''}</span>;
  if (h.state === 'untried') return <span className="badge neutral">not tried yet</span>;
  if (h.state === 'not_configured') return <span className="badge bad">not set up</span>;
  return <><span className="badge bad">failing{h.lastFailedAt ? ` since ${localTime(h.lastFailedAt)}` : ''}</span>
    {h.lastError && <span className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{h.lastError}</span>}</>;
}

function StatusSection() {
  const { status, localTime } = useApp();
  if (!status) return null;
  return (
    <Section title="Status">
      <p style={{ marginBottom: 8 }}>
        House announcements: <HouseLine house={status.house} localTime={localTime} />
      </p>
      {status.recentDeliveries.length === 0 ? <p className="muted">No alerts sent yet.</p> : (
        <table className={s.table}>
          <thead><tr><th scope="col">Alert</th><th scope="col">Via</th><th scope="col">Result</th><th scope="col">When</th></tr></thead>
          <tbody>
            {status.recentDeliveries.map((d) => (
              <tr key={d.id}>
                <th scope="row" className={s.flexible} title={`${d.message}${d.detail ? `\n${d.detail}` : ''}`}>{d.message}{d.member ? ` → ${d.member}` : ''}</th>
                <td className={s.rigid}>{d.channel === 'push' ? '📱' : '🔊'}<span className="visually-hidden">{d.channel}</span></td>
                <td className={s.rigid}><span className={`badge ${STATUS_BADGE[d.status] ?? 'neutral'}`} title={d.detail ?? ''}>{d.status}</span></td>
                <td className={s.rigid}>{localTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/** `openAlert`: a tapped notification's alert, whose card opens in Alerts (§9.5). */
export function Settings({ onLogout, openAlert, onAlertOpened }: { onLogout: () => void; openAlert: string | null; onAlertOpened: () => void }) {
  const { me } = useApp();
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Settings</h1>
      <MeSection onLogout={onLogout} />
      <Section title="Alerts"><MyAlerts openId={openAlert} onOpened={onAlertOpened} /></Section>
      {isAdmin(me) && <HouseholdSection />}
      <StatusSection />
    </div>
  );
}
