// SPEC §9.2e — the house's devices, room by room: what a device is (its HA entity id's prefix), what a valid room list
// is, Home Assistant's answers read into the wire types, and a tap turned into one allowed service call. Pure; HA's
// answers are data. A caller never names a service: deviceCall picks it from a fixed list per domain.
import { DEVICE_ACTION, DEVICE_DOMAIN, isOneOf, type DeviceDomain } from './vocab';

export const ROOM_DEVICES_MAX = 12;
export const DEVICES_ERROR = `devices must be a list of up to ${ROOM_DEVICES_MAX} different Home Assistant device ids (climate, light, switch or fan).`;

/** An AC's own fields, from HA's attributes; a number HA doesn't give is null. */
export interface Climate { mode: string; modes: string[]; current: number | null; target: number | null; min: number | null; max: number | null; step: number }

/** A device as the API sends it: its live state from HA; `error` says why HA didn't answer for it. */
export interface Device {
  id: string; name: string; domain: DeviceDomain; state: string; available: boolean; on: boolean;
  climate: Climate | null; error: string | null;
}

/** A line of the pick list (GET /house/devices adds `roomId`). */
export interface DeviceChoice { id: string; name: string; domain: DeviceDomain }

/** `climate.<slug>` → climate, and so on for each DEVICE_DOMAIN; anything else → null. */
export function deviceDomain(id: unknown): DeviceDomain | null {
  if (typeof id !== 'string') return null;
  const m = /^([a-z_]+)\.[a-z0-9_]+$/.exec(id);
  return m && isOneOf(DEVICE_DOMAIN, m[1]) ? m[1] : null;
}

/** PUT /rooms/{id}/devices `devices` → the list, or DEVICES_ERROR. */
export function parseRoomDevices(v: unknown): string[] | string {
  if (!Array.isArray(v) || v.length > ROOM_DEVICES_MAX || new Set(v).size !== v.length) return DEVICES_ERROR;
  return v.every((id) => deviceDomain(id) !== null) ? (v as string[]) : DEVICES_ERROR;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const UNAVAILABLE = ['unavailable', 'unknown'];

/** HA's `/api/states/{id}` answer → the Device, or null when it isn't one. */
export function deviceFromState(id: string, text: string): Device | null {
  const domain = deviceDomain(id);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const st = raw as { state?: unknown; attributes?: Record<string, unknown> } | null;
  if (!domain || !st || typeof st.state !== 'string') return null;
  const a = st.attributes ?? {};
  const name = typeof a.friendly_name === 'string' && a.friendly_name.trim() ? a.friendly_name.trim() : id;
  const available = !UNAVAILABLE.includes(st.state);
  const modes = Array.isArray(a.hvac_modes) ? a.hvac_modes.filter((m): m is string => typeof m === 'string') : [];
  const climate = domain !== 'climate' ? null : {
    mode: st.state, modes, current: num(a.current_temperature), target: num(a.temperature),
    min: num(a.min_temp), max: num(a.max_temp), step: num(a.target_temp_step) ?? 1,
  };
  return { id, name, domain, state: st.state, available, on: available && st.state !== 'off', climate, error: null };
}

/** The Device shown when HA didn't answer for it (or answered something unreadable). */
export function deviceUnreachable(id: string, reason: string): Device {
  return { id, name: id, domain: deviceDomain(id) ?? 'switch', state: 'unavailable', available: false, on: false, climate: null, error: reason };
}

/** HA's template answer (DEVICE_TEMPLATE) → the pick list, A–Z by name; not a JSON array → null. */
export function devicePickList(text: string): DeviceChoice[] | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: DeviceChoice[] = [];
  for (const e of raw as { id?: unknown; name?: unknown }[]) {
    const domain = deviceDomain(e?.id);
    if (!domain || seen.has(e.id as string)) continue;
    seen.add(e.id as string);
    out.push({ id: e.id as string, name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : (e.id as string), domain });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

export interface DeviceCall { path: string; payload: Record<string, unknown> }

/** A target clamped to the AC's min…max and rounded to its step. */
function snapTarget(t: number, c: Climate): number {
  const lo = c.min ?? -Infinity, hi = c.max ?? Infinity;
  const snapped = Math.round(Math.min(hi, Math.max(lo, t)) / c.step) * c.step;
  return Number(Math.min(hi, Math.max(lo, snapped)).toFixed(2));
}

/** POST /house/devices/{entity} body → the one service to call, or the 400 message. */
export function deviceCall(device: Device, b: Record<string, unknown>): DeviceCall | string {
  const entity_id = device.id;
  if (!isOneOf(DEVICE_ACTION, b.action)) return `action must be one of: ${DEVICE_ACTION.join(', ')}.`;
  if (b.action === 'on' || b.action === 'off') return { path: `/api/services/${device.domain}/turn_${b.action}`, payload: { entity_id } };
  const c = device.climate;
  if (!c || (b.action === 'target' && c.target === null)) return `${b.action} isn't something a ${device.domain} does.`;
  if (b.action === 'mode') {
    if (!isOneOf(c.modes, b.mode)) return `mode must be one of: ${c.modes.join(', ')}.`;
    return { path: '/api/services/climate/set_hvac_mode', payload: { entity_id, hvac_mode: b.mode } };
  }
  if (typeof b.target !== 'number' || !Number.isFinite(b.target)) return 'target must be a number.';
  return { path: '/api/services/climate/set_temperature', payload: { entity_id, temperature: snapTarget(b.target, c) } };
}
