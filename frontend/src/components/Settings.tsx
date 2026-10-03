// SPEC §8.6 — Me, Household (owner), School holidays (owner), Status.
import { useEffect, useState, type ReactNode } from 'react';
import { del, get, patch, post, put } from '../api';
import { useApp } from '../state';
import { MEMBER_PALETTE } from '../../../src/shared/vocab';
import { useAction } from './useAction';
import { Invites } from './Invites';
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
      <label className="row" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!me.showPublicHolidays} onChange={(e) => save({ showPublicHolidays: e.target.checked })} /> Show public holidays
      </label>
      <label className="row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={!!me.showSchoolHolidays} onChange={(e) => save({ showSchoolHolidays: e.target.checked })} /> Show school holidays
      </label>
      <label className="row" style={{ marginBottom: 12, marginTop: -4 }}>
        <input type="checkbox" checked={!!me.showOptionsExpiration} onChange={(e) => save({ showOptionsExpiration: e.target.checked })} /> 📈 Show monthly options expiration
      </label>
      <PhoneAlerts />
      <button onClick={() => run(async () => { await post('/auth/logout'); onLogout(); })}>Log out</button>
    </Section>
  );
}

function PhoneAlerts() {
  const { status } = useApp();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => { get('/push/vapid-key').then((r) => setKey(r.key)).catch(() => setKey(null)); }, []);
  const subs = status?.mySubscriptions.length ?? 0;
  return (
    <div className="field">
      <span className="muted" style={{ fontSize: '.8rem' }}>Phone alerts</span>
      <div className="row" style={{ marginTop: 4 }}>
        {subs ? <span className="badge good">{subs} device{subs > 1 ? 's' : ''} subscribed</span> : <span className="badge bad">Phone alerts off</span>}
      </div>
      {key === null && (
        <p className="muted" style={{ fontSize: '.85rem', marginTop: 6 }}>
          Not available yet: the server has no push keys. Phone push is milestone M5 and needs the app deployed on HTTPS.
          Until then, alerts show in the red Ringing bar and (if chosen) are spoken in the house.
        </p>
      )}
    </div>
  );
}

function HouseholdSection() {
  const { householdName, tz, members, refresh } = useApp();
  const [name, setName] = useState(householdName);
  const [zone, setZone] = useState(tz);
  const { run, busy, errorEl } = useAction();

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
              <td className={s.rigid}>{m.disabledAt ? <span className="badge bad">disabled</span> : <span className="chip">{m.role}</span>}</td>
              <td className={s.rigid}>
                {m.role !== 'owner' && (
                  <button disabled={busy} onClick={() => run(async () => { await patch(`/members/${m.id}`, { disabled: !m.disabledAt }); refresh(); })}>
                    {m.disabledAt ? 'Enable' : 'Disable'}
                  </button>
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

function SchoolHolidaysSection() {
  const { version, refresh } = useApp();
  const [rows, setRows] = useState<{ date: string; label: string }[]>([]);
  const [f, setF] = useState({ from: '', to: '', label: '' });
  const { run, busy, errorEl } = useAction();
  useEffect(() => { get('/school-holidays').then(setRows).catch(() => undefined); }, [version]);

  return (
    <Section title="School holidays">
      {errorEl}
      <div className="row wrap">
        <label className="field" style={{ flex: 1, minWidth: 130 }}><span>From</span><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="field" style={{ flex: 1, minWidth: 130 }}><span>To (optional)</span><input type="date" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      </div>
      <label className="field"><span>Label</span><input value={f.label} maxLength={80} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Winter break" /></label>
      <button className="primary" disabled={busy || !f.from || !f.label.trim()} onClick={() => run(async () => {
        await put('/school-holidays', { from: f.from, to: f.to || f.from, label: f.label }); setF({ from: '', to: '', label: '' }); refresh();
      })}>Add</button>
      {rows.length > 0 && (
        <table className={s.table} style={{ marginTop: 10 }}>
          <thead><tr><th scope="col">Date</th><th scope="col">Label</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <th scope="row" className={s.rigid}>{r.date}</th>
                <td className={s.flexible}>{r.label}</td>
                <td className={s.rigid}><button className="plain" aria-label={`Remove ${r.date}`} title="Remove" disabled={busy} onClick={() => run(async () => { await del(`/school-holidays/${r.date}`); refresh(); })}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

const STATUS_BADGE: Record<string, string> = { sent: 'good', partial: 'warn', failed: 'bad', queued: 'neutral', claimed: 'neutral' };

function StatusSection() {
  const { status, localTime } = useApp();
  if (!status) return null;
  return (
    <Section title="Status">
      <p style={{ marginBottom: 8 }}>
        House announcements: {status.relayOnline
          ? <span className="badge good">relay online</span>
          : <span className="badge bad">relay offline{status.relayLastSeen ? ` since ${localTime(status.relayLastSeen)}` : ' (never seen)'}</span>}
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

export function Settings({ onLogout }: { onLogout: () => void }) {
  const { me } = useApp();
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Settings</h1>
      <MeSection onLogout={onLogout} />
      {me.role === 'owner' && <HouseholdSection />}
      {me.role === 'owner' && <SchoolHolidaysSection />}
      <StatusSection />
    </div>
  );
}
