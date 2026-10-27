// SPEC §9.2e — the house's devices, asked of Home Assistant through ha.ts: the pick list (DEVICE_TEMPLATE), each
// device's state, and one service call. Gives HA's raw text or an honest reason; shared/home-devices.ts reads the
// answers and decides the call. No Hono, no D1.
import { haCall, type HaConfig } from './ha';
import { DEVICE_DOMAIN } from '../shared/vocab';
import type { DeviceCall } from '../shared/home-devices';
import type { AccessResult } from './access';

export const DEVICE_LIST_TIMEOUT_MS = 15_000;
export const DEVICE_STATE_TIMEOUT_MS = 10_000;
export const DEVICE_CALL_TIMEOUT_MS = 15_000;

/** §9.2e — every climate / light / switch / fan entity HA has, with its name; read by devicePickList, never here. */
export const DEVICE_TEMPLATE = `{%- set ns = namespace(out=[]) -%}
{%- for s in states if s.domain in ${JSON.stringify([...DEVICE_DOMAIN]).replace(/"/g, "'")} -%}
  {%- set ns.out = ns.out + [{'id': s.entity_id, 'name': s.name}] -%}
{%- endfor -%}
{{ ns.out | tojson }}`;

/** One POST of DEVICE_TEMPLATE to /api/template → HA's raw answer, or an honest reason. */
export const houseDeviceList = (cfg: HaConfig) => haCall(cfg, 'POST', '/api/template', { template: DEVICE_TEMPLATE }, DEVICE_LIST_TIMEOUT_MS);

/** One GET /api/states/{id} per device, all at once, in the order given. Ids are checked by the caller (deviceDomain). */
export const deviceStates = (cfg: HaConfig, ids: readonly string[]): Promise<AccessResult[]> =>
  Promise.all(ids.map((id) => haCall(cfg, 'GET', `/api/states/${id}`, undefined, DEVICE_STATE_TIMEOUT_MS)));

/** The one service deviceCall chose. */
export const callDeviceService = (cfg: HaConfig, call: DeviceCall) => haCall(cfg, 'POST', call.path, call.payload, DEVICE_CALL_TIMEOUT_MS);
