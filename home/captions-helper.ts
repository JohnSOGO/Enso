// SPEC §7E.2c — the SogoAI captions helper. Runs at home (Node 24), never in the Worker: polls the Worker's
// POST /api/v1/captions/claim, reads that video's captions from the home IP with the SAME youtube-captions.ts, and
// reports the CaptionsResult exactly as it came; claims again until 204, then waits 10 s. A network error doubles
// the wait up to 60 s; it never exits. One log line per job and per error; the token is never logged. Node globals
// and youtube-captions.ts only (§2.5) — `npm run build:home` bundles it into home/dist/captions-helper.mjs. Config:
// ENSO_URL and CAPTIONS_TOKEN from the environment (captions-helper.env, via node --env-file).
import { readCaptions } from '../src/worker/youtube-captions';

export const IDLE_MS = 10_000;
export const BACKOFF_MAX_MS = 60_000;

export interface HelperConfig {
  fetch: typeof fetch;
  /** The Worker's origin, e.g. https://enso.sogodojo.com */
  url: string;
  token: string;
  log?: (line: string) => void;
}

const stamp = (line: string) => `${new Date().toISOString()} ${line}`;

/** One pass: claim → readCaptions → report, until the claim answers 204. → how many jobs were reported. Throws on a
 *  network error or a claim answering anything but 200 / 204 (the loop backs off). */
export async function runOnce(cfg: HelperConfig): Promise<number> {
  const log = cfg.log ?? ((line: string) => console.log(stamp(line)));
  const api = `${cfg.url.replace(/\/+$/, '')}/api/v1/captions`;
  const headers = { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' };
  for (let done = 0; ; done++) {
    const claim = await cfg.fetch(`${api}/claim`, { method: 'POST', headers });
    if (claim.status === 204) return done;
    if (claim.status !== 200) throw new Error(`claim answered HTTP ${claim.status}`);
    const job = (await claim.json()) as { recipeId: string; videoId: string };
    const result = await readCaptions(job.videoId, { fetch: cfg.fetch });
    const report = await cfg.fetch(`${api}/report`, {
      method: 'POST', headers, body: JSON.stringify({ recipeId: job.recipeId, result }),
    });
    const answer = (await report.json().catch(() => null)) as { outcome?: string; error?: string } | null;
    const got = result.ok ? `captions (${result.text.length} chars)` : `${result.kind}: ${result.reason}`;
    log(`${job.videoId} ${got} → ${report.ok ? answer?.outcome : `report HTTP ${report.status} ${answer?.error ?? ''}`.trim()}`);
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The loop: never exits. */
export async function main(cfg: HelperConfig): Promise<never> {
  console.log(stamp(`captions helper polling ${cfg.url} every ${IDLE_MS / 1000} s`));
  for (let wait = IDLE_MS; ; await sleep(wait)) {
    try {
      await runOnce(cfg);
      wait = IDLE_MS;
    } catch (err) {
      wait = Math.min(wait * 2, BACKOFF_MAX_MS);
      console.error(stamp(`error: ${err instanceof Error ? err.message : String(err)} — trying again in ${wait / 1000} s`));
    }
  }
}

// Run only as the bundled script (node captions-helper.mjs), never when a test imports this file.
const proc = (globalThis as { process?: { argv?: string[]; env?: Record<string, string | undefined>; exitCode?: number } }).process;
if (proc?.argv?.[1]?.endsWith('captions-helper.mjs')) {
  const url = proc.env?.ENSO_URL, token = proc.env?.CAPTIONS_TOKEN;
  if (!url || !token) {
    console.error(stamp('ENSO_URL and CAPTIONS_TOKEN must be set (captions-helper.env)'));
    proc.exitCode = 1;
  } else {
    void main({ fetch, url, token });
  }
}
