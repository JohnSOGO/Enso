// SPEC §6.2a — the invite link format round-trips, and a pasted link or a bare code both yield the code.
import { describe, expect, it } from 'vitest';
import { JOIN_PATH, inviteCodeFrom, inviteLink, normalizeInviteCode } from '../src/shared/invite-link';

describe('invite link (SPEC §6.2a)', () => {
  it('round trips: the code taken from the link is the code put in', () => {
    for (const origin of ['https://enso.example', 'http://192.168.0.72:5173']) {
      expect(inviteCodeFrom(inviteLink(origin, 'ABCD-EFGH-JKMN'))).toBe('ABCD-EFGH-JKMN');
    }
  });

  it('builds {origin}/join#{code}', () => {
    expect(inviteLink('https://enso.example', 'ABCD-EFGH-JKMN')).toBe(`https://enso.example${JOIN_PATH}#ABCD-EFGH-JKMN`);
  });

  it('takes the code from a whole pasted link', () => {
    expect(inviteCodeFrom('http://192.168.0.72:5173/join#abcd-efgh-jkmn')).toBe('abcd-efgh-jkmn');
  });

  it('takes a bare code as it is', () => {
    expect(inviteCodeFrom('ABCD-EFGH-JKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('trims surrounding whitespace, around a code or a link', () => {
    expect(inviteCodeFrom('  ABCD-EFGH-JKMN \n')).toBe('ABCD-EFGH-JKMN');
    expect(inviteCodeFrom(' https://enso.example/join#ABCD-EFGH-JKMN  ')).toBe('ABCD-EFGH-JKMN');
  });

  it('normalizeInviteCode (§6.2): upper-cases, strips dashes and spaces, I/L → 1, O → 0', () => {
    expect(normalizeInviteCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizeInviteCode('ab cd - ef')).toBe('ABCDEF');
    expect(normalizeInviteCode('i-l-o-I-L-O')).toBe('110110');
  });
});
