// SPEC §7E.2 step 7 — the UNOFFICIAL captions attempt for one video: no key; YouTube's player endpoint
// asked as its Android app (the website's caption files come back empty without a proof-of-origin
// token, found 2026-10-04), its caption track list (English preferred), then that track as json3 (or
// timedtext XML) → plain text. YouTube may refuse it at any time, so every problem is an honest
// failure + reason (blocked / none / failed) and nothing here ever throws. Self-contained: deleting
// this file removes only the captions.
import type { CaptionsFailure } from '../shared/vocab';

export type CaptionsResult =
  | { ok: true; text: string; language: string }
  | { ok: false; kind: CaptionsFailure; reason: string };

interface Track { baseUrl: string; languageCode: string; kind?: string }

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' };
const HEADERS = { 'content-type': 'application/json', 'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' };
const fail = (kind: CaptionsFailure, reason: string): CaptionsResult => ({ ok: false, kind, reason });
const refused = (status: number) => status === 403 || status === 429;

export async function readCaptions(videoId: string, opts: { fetch?: typeof fetch } = {}): Promise<CaptionsResult> {
  try {
    return await attempt(videoId, opts.fetch ?? fetch);
  } catch (err) {
    return fail('failed', err instanceof Error && err.message ? err.message : String(err));
  }
}

async function attempt(videoId: string, get: typeof fetch): Promise<CaptionsResult> {
  const res0 = await get(PLAYER, { method: 'POST', headers: HEADERS, body: JSON.stringify({ context: { client: CLIENT }, videoId }) });
  if (refused(res0.status)) return fail('blocked', `YouTube refused the player request (HTTP ${res0.status}).`);
  if (!res0.ok) return fail('failed', `The player answered HTTP ${res0.status}.`);
  const player: any = await res0.json();
  const playable = player?.playabilityStatus?.status;
  if (playable !== 'OK') return fail('blocked', `YouTube's player said ${playable ?? 'nothing'}${player?.playabilityStatus?.reason ? `: ${player.playabilityStatus.reason}` : ''}.`);
  const list: unknown = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const tracks = Array.isArray(list) ? list.filter((t): t is Track => typeof t?.baseUrl === 'string' && typeof t?.languageCode === 'string') : [];
  if (!tracks.length) return fail('none', 'This video has no captions.');
  const track = pick(tracks);
  const url = new URL(track.baseUrl, 'https://www.youtube.com');
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return fail('failed', `The caption track points at ${url.hostname}.`);
  url.searchParams.set('fmt', 'json3');
  const res = await get(url.toString(), { headers: { 'user-agent': HEADERS['user-agent'] } });
  if (refused(res.status)) return fail('blocked', `YouTube refused the captions (HTTP ${res.status}).`);
  if (!res.ok) return fail('failed', `The captions answered HTTP ${res.status}.`);
  const body = await res.text();
  if (!body.trim()) return fail('blocked', 'YouTube sent an empty caption file.');
  const text = toText(body);
  return text ? { ok: true, text, language: track.languageCode } : fail('failed', 'The caption file had no text in it.');
}

/** English written by a person, then English auto-captions, then whatever comes first. */
function pick(tracks: Track[]): Track {
  const en = tracks.filter((t) => t.languageCode.toLowerCase().startsWith('en'));
  return en.find((t) => t.kind !== 'asr') ?? en[0] ?? tracks[0];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec?: string, hex?: string, name?: string) =>
  dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name!.toLowerCase()] ?? m);

/** json3 (`events[].segs[].utf8`) or timedtext XML (`<text>` / `<p>`) → one line of plain text. */
function toText(body: string): string {
  const parts: string[] = [];
  if (body.trimStart().startsWith('{')) {
    const events: unknown = JSON.parse(body).events;
    for (const e of Array.isArray(events) ? events : []) {
      const segs = Array.isArray(e?.segs) ? e.segs : [];
      parts.push(segs.map((s: any) => (typeof s?.utf8 === 'string' ? s.utf8 : '')).join(''));
    }
  } else {
    for (const m of body.matchAll(/<(text|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) parts.push(decode(decode(m[2].replace(/<[^>]*>/g, ''))));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
