// SPEC §7E.2 step 6 — one video's snippet from the YouTube Data API v3 (`videos.list?part=snippet`):
// its title, channel and description, or an honest failure (not found / quota / failed + reason). The
// key never appears in a reason. `fetch` is injectable for tests. It never decides what is saved.
const ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';

export type VideoLookup =
  | { ok: true; title: string | null; channel: string | null; description: string | null }
  | { ok: false; kind: 'not_found' | 'quota' | 'failed'; reason: string };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

export async function lookUpVideo(videoId: string, apiKey: string, opts: { fetch?: typeof fetch } = {}): Promise<VideoLookup> {
  const get = opts.fetch ?? fetch;
  const scrub = (s: string) => (apiKey ? s.split(apiKey).join('…') : s);
  const url = `${ENDPOINT}?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await get(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { ok: false, kind: 'failed', reason: scrub(`Couldn't reach YouTube: ${err instanceof Error ? err.message : String(err)}`) };
  }
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const reasons: unknown[] = Array.isArray(body?.error?.errors) ? body.error.errors.map((e: any) => e?.reason) : [];
    if (res.status === 403 && reasons.some((r) => typeof r === 'string' && /quota|dailyLimit/i.test(r))) {
      return { ok: false, kind: 'quota', reason: "YouTube's daily quota for this app is used up; try again tomorrow." };
    }
    const said = typeof body?.error?.message === 'string' ? `: ${body.error.message}` : '';
    return { ok: false, kind: 'failed', reason: scrub(`YouTube answered ${res.status}${said}`) };
  }
  const snippet = Array.isArray(body?.items) ? body.items[0]?.snippet : undefined;
  if (!snippet) return { ok: false, kind: 'not_found', reason: 'YouTube has no public video at that link.' };
  return { ok: true, title: text(snippet.title), channel: text(snippet.channelTitle), description: text(snippet.description) };
}
