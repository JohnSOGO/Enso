// SPEC §9.2e HD1–HD4 — the house's devices: what a device is, a room's list, HA's answers read, and a tap made into
// one allowed service call. Pure.
import { expect, it } from 'vitest';
import {
  DEVICES_ERROR, deviceCall, deviceDomain, deviceFromState, devicePickList, deviceUnreachable, parseRoomDevices,
} from '../src/shared/home-devices';
import { AC, AC_STATE } from './ha-helpers';

it('HD1: deviceDomain and parseRoomDevices', () => {
  expect(deviceDomain(AC)).toBe('climate');
  expect(deviceDomain('light.x')).toBe('light');
  expect(deviceDomain('switch.plug_1')).toBe('switch');
  expect(deviceDomain('fan.ceiling')).toBe('fan');
  for (const bad of ['media_player.x', 'climate.Bad Id', '', null, 3]) expect(deviceDomain(bad)).toBeNull();
  expect(parseRoomDevices([AC, 'light.x'])).toEqual([AC, 'light.x']);
  expect(parseRoomDevices([])).toEqual([]);
  expect(parseRoomDevices(Array.from({ length: 13 }, (_, i) => `light.l${i}`))).toBe(DEVICES_ERROR);
  expect(parseRoomDevices(['light.x', 'light.x'])).toBe(DEVICES_ERROR);
  expect(parseRoomDevices(['media_player.x'])).toBe(DEVICES_ERROR);
  expect(parseRoomDevices('light.x')).toBe(DEVICES_ERROR);
});

it('HD2: deviceFromState reads the AC, an unavailable light, and refuses junk', () => {
  expect(deviceFromState(AC, AC_STATE)).toEqual({
    id: AC, name: 'Midea AC 151732605523107', domain: 'climate', state: 'fan_only', available: true, on: true, error: null,
    climate: { mode: 'fan_only', modes: ['fan_only', 'dry', 'cool', 'auto', 'off'], current: 54.5, target: 70, min: 60, max: 86, step: 1 },
  });
  const light = deviceFromState('light.x', JSON.stringify({ state: 'unavailable', attributes: {} }))!;
  expect(light).toMatchObject({ name: 'light.x', available: false, on: false, climate: null });
  expect(deviceFromState('light.x', JSON.stringify({ state: 'off', attributes: { friendly_name: 'Lamp' } }))).toMatchObject({ name: 'Lamp', available: true, on: false });
  expect(deviceFromState(AC, 'oops')).toBeNull();
  expect(deviceFromState('media_player.x', AC_STATE)).toBeNull();
  expect(deviceUnreachable(AC, 'HTTP 404: x')).toMatchObject({ id: AC, available: false, on: false, error: 'HTTP 404: x' });
});

it('HD3: deviceCall picks only the allowed services', () => {
  const ac = deviceFromState(AC, AC_STATE)!;
  const lamp = deviceFromState('light.lamp', JSON.stringify({ state: 'on', attributes: {} }))!;
  expect(deviceCall(ac, { action: 'off' })).toEqual({ path: '/api/services/climate/turn_off', payload: { entity_id: AC } });
  expect(deviceCall(lamp, { action: 'on' })).toEqual({ path: '/api/services/light/turn_on', payload: { entity_id: 'light.lamp' } });
  expect(deviceCall(ac, { action: 'mode', mode: 'cool' })).toEqual({ path: '/api/services/climate/set_hvac_mode', payload: { entity_id: AC, hvac_mode: 'cool' } });
  expect(deviceCall(ac, { action: 'mode', mode: 'heat' })).toBe('mode must be one of: fan_only, dry, cool, auto, off.');
  expect(deviceCall(ac, { action: 'target', target: 90 })).toEqual({ path: '/api/services/climate/set_temperature', payload: { entity_id: AC, temperature: 86 } });
  expect((deviceCall(ac, { action: 'target', target: 70.4 }) as any).payload.temperature).toBe(70);
  expect(deviceCall(ac, { action: 'target', target: 'hot' })).toBe('target must be a number.');
  expect(deviceCall(lamp, { action: 'mode', mode: 'cool' })).toBe("mode isn't something a light does.");
  expect(deviceCall(lamp, { action: 'target', target: 70 })).toBe("target isn't something a light does.");
  expect(deviceCall(ac, { action: 'explode' })).toBe('action must be one of: on, off, mode, target.');
  expect(deviceCall(ac, { action: 'on', path: '/api/services/lock/unlock' })).toEqual({ path: '/api/services/climate/turn_on', payload: { entity_id: AC } });
});

it('HD4: devicePickList', () => {
  const text = JSON.stringify([{ id: 'switch.b', name: 'Plug' }, { id: AC, name: 'Midea AC' }, { id: 'media_player.tv', name: 'TV' },
    { id: 'switch.b', name: 'Again' }, { id: 'light.c', name: ' ' }]);
  expect(devicePickList(text)).toEqual([
    { id: 'light.c', name: 'light.c', domain: 'light' }, { id: AC, name: 'Midea AC', domain: 'climate' }, { id: 'switch.b', name: 'Plug', domain: 'switch' },
  ]);
  expect(devicePickList('{"a":1}')).toBeNull();
  expect(devicePickList('oops')).toBeNull();
});
