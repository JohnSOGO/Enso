// SPEC §7C.4b — fetches one web page for a link reading: no cookies or credentials, redirects followed by
// hand (each hop re-checked by readableLink, so a public link can't bounce to a private host), a timeout,
// the body read as a stream up to PAGE_BYTES_MAX, HTML or plain text only. Never throws: a failure is a
// reason the caller keeps. No D1, no Hono; never decides what is read or saved.
import { PAGE_BYTES_MAX, PAGE_FETCH_TIMEOUT_MS, readableLink } from '../shared/link-reading';

export const PAGE_REDIRECTS_MAX = 5;

export type FetchPageResult = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };

/** The body up to `max` bytes (the rest dropped, the stream cancelled), decoded as UTF-8. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    const keep = value.subarray(0, max - size);
    parts.push(keep);
    size += keep.length;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return new TextDecoder().decode(all);
}

/** One page, or why not. `fetch` is for tests only. */
export async function fetchPage(url: string, opts: { fetch?: typeof fetch } = {}): Promise<FetchPageResult> {
  const doFetch = opts.fetch ?? fetch;
  const signal = AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS);
  let current = url;
  try {
    for (let hop = 0; hop <= PAGE_REDIRECTS_MAX; hop++) {
      const res = await doFetch(current, {
        redirect: 'manual', signal, // a Worker's fetch sends no cookies of its own
        headers: { accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'user-agent': 'Mozilla/5.0 (compatible; Enso household app)' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = readableLink(new URL(res.headers.get('location')!, current).href);
        await res.body?.cancel().catch(() => undefined);
        if (!next) return { ok: false, reason: 'the page redirected to a link that can\'t be read' };
        current = next;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, reason: `the site answered ${res.status}` };
      }
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (type && !type.startsWith('text/html') && !type.startsWith('text/plain') && !type.includes('xhtml')) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, reason: `it isn't a web page (${type.split(';')[0]})` };
      }
      return { ok: true, html: await readCapped(res, PAGE_BYTES_MAX), finalUrl: current };
    }
    return { ok: false, reason: 'too many redirects' };
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return { ok: false, reason: `no answer in ${PAGE_FETCH_TIMEOUT_MS / 1000} seconds` };
    }
    return { ok: false, reason: err instanceof Error && err.message ? err.message : 'the site couldn\'t be reached' };
  }
}
