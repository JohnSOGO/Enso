// SPEC §7E.2c, §7A.3, §8.4a — asking the SogoAI helper, in-line, through Cloudflare Access and the `sogoai` tunnel:
// one video's captions (GET /captions, checked by parseCaptionsReport), a snapped item's name (POST /identify with
// the image, checked by parseIdentifyReport) and a notes text's marks (POST /note-marks, checked by
// parseNoteMarksReport). Each is one request with Bearer CAPTIONS_TOKEN through access.ts (the
// Access headers, redirect 'manual', 2xx only, a timeout). Never throws, never names a secret, never decides whether
// to ask or what is saved (the routes do). No D1, no Hono. A leaf sibling of house.ts.
import type { Env } from './env';
import { parseCaptionsReport } from '../shared/recipe-reading';
import { parseIdentifyReport } from '../shared/item-reading';
import { parseNoteMarksReport, type NoteMarksReport } from '../shared/note-marks';
import { callThroughAccess } from './access';

/** ⚑ Q96 — how long the Worker waits for SogoAI. */
export const HOME_CAPTIONS_TIMEOUT_MS = 20_000;
/** ⚑ Q114 — how long the Worker waits for SogoAI to name a snapped item. */
export const HOME_IDENTIFY_TIMEOUT_MS = 20_000;
/** ⚑ Q370 — how long the Worker waits for SogoAI to mark a notes text: more than its 5 s + 15 s. */
export const HOME_NOTE_MARKS_TIMEOUT_MS = 25_000;

export interface HomeCaptionsConfig { url: string; accessId: string; accessSecret: string; token: string }

/** The four settings, each non-empty, or null — captions from home are then not set up. */
export function homeCaptionsConfigOf(env: Env): HomeCaptionsConfig | null {
  const { HOME_CAPTIONS_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, CAPTIONS_TOKEN } = env;
  if (!HOME_CAPTIONS_URL || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET || !CAPTIONS_TOKEN) return null;
  return {
    url: HOME_CAPTIONS_URL.replace(/\/+$/, ''), accessId: CF_ACCESS_CLIENT_ID, accessSecret: CF_ACCESS_CLIENT_SECRET,
    token: CAPTIONS_TOKEN,
  };
}

export type HomeCaptions = { ok: true; text: string } | { ok: false; reason: string };

/** One GET to `{url}/captions?v=` → the captions' text, or an honest reason: "HTTP n: body", "error: message",
 *  the parse message, or the home's own reason. */
export async function readCaptionsFromHome(cfg: HomeCaptionsConfig, videoId: string,
  opts: { fetch?: typeof fetch } = {}): Promise<HomeCaptions> {
  const res = await callThroughAccess(cfg, `${cfg.url}/captions?v=${encodeURIComponent(videoId)}`, {
    method: 'GET', timeoutMs: HOME_CAPTIONS_TIMEOUT_MS, headers: { Authorization: `Bearer ${cfg.token}` }, fetch: opts.fetch,
  });
  if (!res.ok) return res;
  let body: unknown;
  try { body = JSON.parse(res.text); } catch { return { ok: false, reason: 'The helper answered something that is not JSON.' }; }
  const report = parseCaptionsReport(body);
  if (typeof report === 'string') return { ok: false, reason: report };
  return report.ok ? { ok: true, text: report.text } : { ok: false, reason: report.reason };
}

export type HomeIdentify = { ok: true; text: string } | { ok: false; reason: string };

/** One POST of the image to `{url}/identify` → the local model's raw text (the route cleans it), or an honest
 *  reason: "HTTP n: body", "error: message", the parse message, or the home's own reason. */
export async function identifyFromHome(cfg: HomeCaptionsConfig, photo: ArrayBuffer, type: string,
  opts: { fetch?: typeof fetch } = {}): Promise<HomeIdentify> {
  const res = await callThroughAccess(cfg, `${cfg.url}/identify`, {
    method: 'POST', timeoutMs: HOME_IDENTIFY_TIMEOUT_MS, body: photo, fetch: opts.fetch,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': type },
  });
  if (!res.ok) return res;
  let body: unknown;
  try { body = JSON.parse(res.text); } catch { return { ok: false, reason: 'The helper answered something that is not JSON.' }; }
  const report = parseIdentifyReport(body);
  if (typeof report === 'string') return { ok: false, reason: report };
  return report.ok ? { ok: true, text: report.text } : { ok: false, reason: report.reason };
}

/** One POST of the notes to `{url}/note-marks` → the helper's NoteMarksReport, its kind kept (the sheet tells busy
 *  from off); the transport or a bad answer → `failed` with the reason. The marks are as the model gave them
 *  (validMarks decides). */
export async function noteMarksFromHome(cfg: HomeCaptionsConfig, text: string,
  opts: { fetch?: typeof fetch } = {}): Promise<NoteMarksReport> {
  const res = await callThroughAccess(cfg, `${cfg.url}/note-marks`, {
    method: 'POST', timeoutMs: HOME_NOTE_MARKS_TIMEOUT_MS, body: JSON.stringify({ text }), fetch: opts.fetch,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { ok: false, kind: 'failed', reason: res.reason };
  let body: unknown;
  try { body = JSON.parse(res.text); } catch { return { ok: false, kind: 'failed', reason: 'The helper answered something that is not JSON.' }; }
  const report = parseNoteMarksReport(body);
  return typeof report === 'string' ? { ok: false, kind: 'failed', reason: report } : report;
}
