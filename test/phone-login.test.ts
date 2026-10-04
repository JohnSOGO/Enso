// M4v (SPEC §6.6, PL1–PL3) — the pure rules of Sign in with my phone. The routes are phone-login-api.test.ts.
import { expect, it } from 'vitest';
import {
  APPROVE_LOGIN_PATH, LOGIN_REQUEST_TTL_MIN, MATCH_RANDOM_BYTES, NOTICE_TITLE, PLACE_UNKNOWN, USER_AGENT_MAX, UNKNOWN_BROWSER,
  approveLoginUrl, approveView, browserSummary, claim, decide, keptUserAgent, loginRequestExpiry, loginRequestMessage,
  loginWindowStart, matchNumbers, newSignInMessage, placeText, pollView, type LoginRequestState,
} from '../src/shared/phone-login';
import { LOGIN_VIEW } from '../src/shared/vocab';

it('PL1: matchNumbers — a 2-digit match among three distinct 2-digit choices, at every position, deterministic', () => {
  const positions = new Set<number>();
  const matches = new Set<number>();
  for (let i = 0; i < 4000; i++) {
    const bytes = [(i * 37) & 255, (i * 101 + 7) & 255, (i * 53 + 3) & 255, i & 255];
    const { match, choices } = matchNumbers(bytes);
    expect(match).toBeGreaterThanOrEqual(10);
    expect(match).toBeLessThanOrEqual(99);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size, JSON.stringify(bytes)).toBe(3);
    for (const n of choices) expect(n >= 10 && n <= 99, `${n}`).toBe(true);
    expect(choices).toContain(match);
    positions.add(choices.indexOf(match));
    matches.add(match);
    expect(matchNumbers(bytes)).toEqual({ match, choices }); // the same bytes, the same numbers
  }
  expect([...positions].sort()).toEqual([0, 1, 2]);
  expect(matches.size).toBe(90); // every 2-digit number can be the match
  // Edge bytes: the two decoy offsets can never coincide.
  for (const b1 of [0, 88, 89, 255]) for (const b2 of [0, 87, 88, 255]) {
    expect(new Set(matchNumbers([0, b1, b2, 0]).choices).size).toBe(3);
  }
  expect(() => matchNumbers([1, 2, 3].slice(0, MATCH_RANDOM_BYTES - 1))).toThrow();
});

const T0 = '2026-10-04T12:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const row = (over: Partial<LoginRequestState> = {}): LoginRequestState =>
  ({ memberId: 'mem_a', status: 'pending', match: 42, expiresAt: loginRequestExpiry(T0), ...over });

it('PL2: limits, pollView / approveView, decide and claim with an injected now', () => {
  expect(loginRequestExpiry(T0)).toBe(at(LOGIN_REQUEST_TTL_MIN * 60));
  expect(loginWindowStart(T0)).toBe('2026-10-04T11:45:00.000Z');
  expect(approveLoginUrl('lgn_x')).toBe(`${APPROVE_LOGIN_PATH}#lgn_x`);
  expect(APPROVE_LOGIN_PATH).toBe('/approve-login');

  // pollView: expired is derived at expires_at; denied stays denied; used is spent.
  expect(pollView(row(), at(119))).toBe('pending');
  expect(pollView(row(), at(120))).toBe('expired');
  expect(pollView(row({ status: 'approved' }), at(60))).toBe('approved');
  expect(pollView(row({ status: 'approved' }), at(121))).toBe('expired');
  expect(pollView(row({ status: 'denied' }), at(10))).toBe('denied');
  expect(pollView(row({ status: 'denied' }), at(500))).toBe('denied');
  expect(pollView(row({ status: 'used' }), at(10))).toBe('expired');
  expect(approveView(row({ status: 'used' }), at(500))).toBe('approved');
  expect(approveView(row(), at(10))).toBe('pending');
  for (const s of ['pending', 'approved', 'denied', 'used'] as const) {
    expect(LOGIN_VIEW).toContain(pollView(row({ status: s }), at(10)));
    expect(LOGIN_VIEW).toContain(approveView(row({ status: s }), at(500)));
  }

  // decide: who, then whether pending, then expiry; the right number approves, anything else denies.
  expect(decide(row(), 'mem_b', 42, at(10))).toEqual({ ok: false, refusal: 'not_yours' });
  expect(decide(row({ memberId: null }), 'mem_a', 42, at(10))).toEqual({ ok: false, refusal: 'not_yours' });
  expect(decide(row({ status: 'denied' }), 'mem_a', 42, at(10))).toEqual({ ok: false, refusal: 'not_pending' });
  expect(decide(row({ status: 'approved' }), 'mem_a', 42, at(10))).toEqual({ ok: false, refusal: 'not_pending' });
  expect(decide(row({ status: 'used' }), 'mem_a', 42, at(500))).toEqual({ ok: false, refusal: 'not_pending' });
  expect(decide(row(), 'mem_a', 42, at(120))).toEqual({ ok: false, refusal: 'expired' });
  expect(decide(row(), 'mem_a', 42, at(119))).toEqual({ ok: true, status: 'approved' });
  expect(decide(row(), 'mem_a', 17, at(10))).toEqual({ ok: true, status: 'denied' });
  expect(decide(row(), 'mem_a', null, at(10))).toEqual({ ok: true, status: 'denied' });

  // claim: only an approved request, before it expires.
  expect(claim(row({ status: 'approved' }), at(119))).toEqual({ ok: true });
  expect(claim(row({ status: 'approved' }), at(120))).toEqual({ ok: false, refusal: 'expired' });
  expect(claim(row(), at(10))).toEqual({ ok: false, refusal: 'not_approved' });
  expect(claim(row({ status: 'used' }), at(10))).toEqual({ ok: false, refusal: 'not_approved' });
  expect(claim(row({ status: 'denied' }), at(10))).toEqual({ ok: false, refusal: 'not_approved' });
});

it('PL3: browserSummary, placeText, keptUserAgent and the notice texts', () => {
  const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  };
  expect(browserSummary(UA.chromeWin)).toBe('Chrome on Windows');
  expect(browserSummary(UA.edgeWin)).toBe('Edge on Windows');
  expect(browserSummary(UA.firefoxMac)).toBe('Firefox on Mac');
  expect(browserSummary(UA.safariMac)).toBe('Safari on Mac');
  expect(browserSummary(UA.safariIphone)).toBe('Safari on iPhone');
  expect(browserSummary(UA.chromeIphone)).toBe('Chrome on iPhone');
  expect(browserSummary(UA.chromeAndroid)).toBe('Chrome on Android');
  expect(browserSummary(UA.firefoxLinux)).toBe('Firefox on Linux');
  expect(browserSummary('curl/8.4.0')).toBe(UNKNOWN_BROWSER);
  expect(browserSummary('')).toBe(UNKNOWN_BROWSER);
  expect(browserSummary(null)).toBe(UNKNOWN_BROWSER);
  expect(browserSummary('SomethingNew/1.0 (Windows NT 10.0)')).toBe('Unknown browser on Windows');

  expect(placeText('Oceanside', 'US')).toBe('Oceanside, US');
  expect(placeText(undefined, 'US')).toBe('US');
  expect(placeText(' ', null)).toBeNull();
  expect(placeText(null, null)).toBeNull();
  expect(PLACE_UNKNOWN).toBe('Place unknown');

  expect(keptUserAgent(undefined)).toBeNull();
  expect(keptUserAgent('  ')).toBeNull();
  expect(keptUserAgent('x'.repeat(USER_AGENT_MAX + 50))).toHaveLength(USER_AGENT_MAX);

  expect(loginRequestMessage('Chrome on Windows')).toBe('Sign-in request from Chrome on Windows — tap to check');
  expect(newSignInMessage('Firefox on Mac')).toBe('New sign-in on Firefox on Mac');
  expect(NOTICE_TITLE).toBe('🔑 Ensō sign-in');
});
