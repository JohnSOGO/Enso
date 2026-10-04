// SPEC §7E.2c — the SogoAI captions helper. Runs at home (Node 24), never in the Worker: a server on
// 127.0.0.1:8790 (loopback only; the `sogoai` Cloudflare Tunnel behind Access is its only way in) answering
// GET /captions?v=… with the CaptionsResult that the SAME youtube-captions.ts reads from the home IP. The
// Worker asks it in-line when YouTube blocks the Worker. Bearer CAPTIONS_TOKEN, compared in constant time.
// One log line per request; the token is never logged. youtube-captions.ts, node:http and Node globals only
// (§2.5) — `npm run build:home` bundles it into home/dist/captions-helper.mjs. Config: CAPTIONS_TOKEN from the
// environment (captions-helper.env, via node --env-file).
import { createServer } from 'node:http';
import { readCaptions } from '../src/worker/youtube-captions';

export const HOST = '127.0.0.1';
export const PORT = 8790;
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface HelperRequest { method: string; url: string; authorization?: string }
export interface HelperDeps { token: string; fetch: typeof fetch }
export interface HelperAnswer { status: number; body: unknown }

const stamp = (line: string) => `${new Date().toISOString()} ${line}`;

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Constant time: the SHA-256 of each (equal lengths), every byte compared. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** One request → its answer, and one log line. Only GET /captions?v=… with the bearer; the CaptionsResult
 *  whatever its ok. */
export async function handle(req: HelperRequest, deps: HelperDeps): Promise<HelperAnswer> {
  const answer = await answerFor(req, deps);
  console.log(stamp(outcome(req, answer)));
  return answer;
}

async function answerFor(req: HelperRequest, deps: HelperDeps): Promise<HelperAnswer> {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname !== '/captions') return { status: 404, body: { error: 'not_found' } };
  if (req.method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  const given = /^Bearer (.+)$/.exec(req.authorization ?? '')?.[1] ?? '';
  if (!(await sameSecret(given, deps.token))) return { status: 401, body: { error: 'unauthorized' } };
  const v = url.searchParams.get('v') ?? '';
  if (!VIDEO_ID.test(v)) return { status: 400, body: { error: 'invalid_video_id' } };
  return { status: 200, body: await readCaptions(v, { fetch: deps.fetch }) };
}

/** What one log line says came of a request: never the token, never a header. */
function outcome(req: HelperRequest, answer: HelperAnswer): string {
  const v = new URL(req.url, `http://${HOST}`).searchParams.get('v') ?? '-';
  const shown = VIDEO_ID.test(v) ? v : '(bad id)';
  const body = answer.body as { ok?: boolean; text?: string; kind?: string; reason?: string; error?: string };
  if (answer.status !== 200) return `${req.method} ${shown} → ${answer.status} ${body.error ?? ''}`.trim();
  return `${shown} → ${body.ok ? `captions (${body.text?.length ?? 0} chars)` : `${body.kind}: ${body.reason}`}`;
}

/** The server: the only node:http user. */
export function main(token: string): void {
  const server = createServer((req, res) => {
    const r: HelperRequest = { method: req.method ?? 'GET', url: req.url ?? '/', authorization: req.headers.authorization };
    handle(r, { token, fetch }).then(
      (answer) => {
        res.writeHead(answer.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(answer.body));
      },
      (err: unknown) => {
        console.error(stamp(`error: ${err instanceof Error ? err.message : String(err)}`));
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'internal' }));
      },
    );
  });
  server.listen(PORT, HOST, () => console.log(stamp(`captions helper listening on http://${HOST}:${PORT}`)));
}

// Run only as the bundled script (node captions-helper.mjs), never when a test imports this file.
const proc = (globalThis as { process?: { argv?: string[]; env?: Record<string, string | undefined>; exitCode?: number } }).process;
if (proc?.argv?.[1]?.endsWith('captions-helper.mjs')) {
  const token = proc.env?.CAPTIONS_TOKEN;
  if (!token) {
    console.error(stamp('CAPTIONS_TOKEN must be set (captions-helper.env)'));
    proc.exitCode = 1;
  } else {
    main(token);
  }
}
