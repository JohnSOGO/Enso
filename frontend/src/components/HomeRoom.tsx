// SPEC §8.19 — one room's devices, live from Home Assistant (GET /rooms/{id}/devices, §9.2e): a card per device with
// On / Off, and for an AC its mode buttons, room and set temperature and − / ＋. Each tap sends the intent
// (POST /house/devices/{id}) and the card shows the state the server answers; it never decides a service itself.
// ✏ Devices (the room's creator or an admin, §6.3) swaps the cards for HomeDevicePicker.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { HomeDevicePicker, DEVICE_EMOJI } from './HomeDevicePicker';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { canChange } from '../../../src/shared/roles';
import type { Device } from '../../../src/shared/home-devices';
import type { Room } from '../../../src/shared/rooms';
import type { DeviceAction } from '../../../src/shared/vocab';

/** §8.19 — HA's hvac modes in words. */
const MODE_NAME: Record<string, string> = { off: 'Off', cool: 'Cool', heat: 'Heat', dry: 'Dry', fan_only: 'Fan', auto: 'Auto', heat_cool: 'Heat/Cool' };
const modeName = (m: string) => MODE_NAME[m] ?? m;
const deg = (n: number | null) => (n === null ? '—' : `${n}°`);

function DeviceCard({ device, onChange }: { device: Device; onChange: (d: Device) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: DeviceAction, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    try { onChange(await post<Device>(`/house/devices/${device.id}`, { action, ...extra })); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const c = device.climate;

  return (
    <section aria-label={device.name} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 10, opacity: device.available ? 1 : 0.6 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{DEVICE_EMOJI[device.domain]} {device.name}</strong>
        {device.available && (
          <button disabled={busy} onClick={() => act(device.on ? 'off' : 'on')}>{device.on ? 'Turn off' : 'Turn on'}</button>
        )}
      </div>
      {!device.available && <p className="muted" style={{ margin: '4px 0 0' }}>Not answering{device.error ? `: ${device.error}` : ''}</p>}
      {device.available && !c && <p className="muted" style={{ margin: '4px 0 0' }}>{device.on ? 'On' : 'Off'}</p>}
      {device.available && c && (
        <>
          <p className="muted" style={{ margin: '4px 0 8px' }}>{modeName(c.mode)} · Room {deg(c.current)} · Set {deg(c.target)}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {c.modes.map((m) => (
              <button key={m} aria-pressed={m === c.mode} disabled={busy} onClick={() => act('mode', { mode: m })}>{modeName(m)}</button>
            ))}
          </div>
          {c.target !== null && (
            <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button aria-label="Lower the set temperature" disabled={busy} onClick={() => act('target', { target: c.target! - c.step })}>−</button>
              <span style={{ fontSize: '1.2rem', minWidth: 48, textAlign: 'center' }}>{deg(c.target)}</span>
              <button aria-label="Raise the set temperature" disabled={busy} onClick={() => act('target', { target: c.target! + c.step })}>＋</button>
            </div>
          )}
        </>
      )}
      {error && <div role="alert" className="alert-error" style={{ marginTop: 8 }}>{error}</div>}
    </section>
  );
}

export function HomeRoom({ room, onClose }: { room: Room; onClose: () => void }) {
  const { me } = useApp();
  const canEdit = canChange(room.createdBy, me);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    setError(null);
    get<{ devices: Device[] }>(`/rooms/${room.id}/devices`).then((r) => setDevices(r.devices)).catch((e) => setError(errorText(e)));
  }, [room.id]);
  useEffect(load, [load]);
  const replace = (d: Device) => setDevices((all) => all?.map((x) => (x.id === d.id ? d : x)) ?? null);

  return (
    <Modal title={room.name} onClose={onClose} dirty={picking}
      footer={<>
        {canEdit && !picking && <button onClick={() => setPicking(true)}>✏ Devices</button>}
        <button onClick={onClose}>Close</button>
      </>}>
      {picking ? (
        <HomeDevicePicker room={room} picked={devices?.map((d) => d.id) ?? []} onCancel={() => setPicking(false)}
          onSaved={() => { setPicking(false); setDevices(null); load(); }} />
      ) : (
        <>
          {error && (
            <div role="alert" className="alert-error">{error} <button className="plain" onClick={load}>Try again</button></div>
          )}
          {devices === null && !error && <p className="muted">Loading…</p>}
          {devices?.length === 0 && <p className="muted">No devices in this room yet.{canEdit && ' Tap ✏ Devices to pick them.'}</p>}
          {devices?.map((d) => <DeviceCard key={d.id} device={d} onChange={replace} />)}
        </>
      )}
    </Modal>
  );
}
