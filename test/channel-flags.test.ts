// SPEC §9.4b FH8 — a new alert's ticks: Phone, plus FunHouse for the founder (Q230); a stored list always wins.
// A .tsx module, so it is loaded at run time: the Worker typecheck has no JSX.
import { expect, it } from 'vitest';
import type { Channel } from '../src/shared/vocab';

type Flags = Record<Channel, boolean>;
const FIELDS = '../frontend/src/components/AlertFields.tsx';
const { channelsOf, flagsOf } = (await import(/* @vite-ignore */ FIELDS)) as {
  channelsOf: (f: Flags) => Channel[]; flagsOf: (channels?: readonly Channel[], funhouseByDefault?: boolean) => Flags;
};

it('FH8: flagsOf defaults and channelsOf order', () => {
  expect(flagsOf(undefined, true)).toEqual({ push: true, house: false, funhouse: true });
  expect(flagsOf(undefined, false)).toEqual({ push: true, house: false, funhouse: false });
  expect(flagsOf(undefined)).toEqual({ push: true, house: false, funhouse: false });
  expect(flagsOf(['house'], true)).toEqual({ push: false, house: true, funhouse: false });
  expect(channelsOf({ push: true, house: false, funhouse: true })).toEqual(['push', 'funhouse']);
});
