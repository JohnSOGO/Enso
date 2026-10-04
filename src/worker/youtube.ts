// SPEC §7E.2 steps 6 and 8 — the YouTube Data API v3. `videos.list?part=snippet`: one video's title,
// channel, channelId and description; `commentThreads.list`: its top-level comments as { authorChannelId,
// text }. Each is an honest failure (not found / quota / none / failed + reason) and never throws; the key
// never appears in a reason. `fetch` is injectable for tests. It never decides what is saved.
const API = 'https://www.googleapis.com/youtube/v3';

export type VideoLookup =
  | { ok: true; title: string | null; channel: string | null; channelId: string | null; description: string | null }
  | { ok: false; kind: 'not_found' | 'quota' | 'failed'; reason: string };

export interface VideoComment { authorChannelId: string | null; text: string }
export type CommentsLookup =
  | { ok: true; comments: VideoComment[] }
  | { ok: false; kind: 'none' | 'quota' | 'failed'; reason: string };

type Opts = { fetch?: typeof fetch };
type Failure = { ok: false; kind: 'quota' | 'failed'; reason: string; reasons: string[] };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** GET one API url → its JSON body, or the failure (quota / failed) with YouTube's error reasons. The key is scrubbed. */
async function getJson(url: string, apiKey: string, opts: Opts): Promise<{ ok: true; body: any } | Failure> {
  const get = opts.fetch ?? fetch;
  const scrub = (s: string) => (apiKey ? s.split(apiKey).join('…') : s);
  let res: Response;
  try {
    res = await get(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { ok: false, kind: 'failed', reasons: [], reason: scrub(`Couldn't reach YouTube: ${err instanceof Error ? err.message : String(err)}`) };
  }
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (res.ok) return { ok: true, body };
  const reasons: string[] = Array.isArray(body?.error?.errors)
    ? body.error.errors.map((e: any) => e?.reason).filter((r: unknown): r is string => typeof r === 'string') : [];
  if (res.status === 403 && reasons.some((r) => /quota|dailyLimit/i.test(r))) {
    return { ok: false, kind: 'quota', reasons, reason: "YouTube's daily quota for this app is used up; try again tomorrow." };
  }
  const said = typeof body?.error?.message === 'string' ? `: ${body.error.message}` : '';
  return { ok: false, kind: 'failed', reasons, reason: scrub(`YouTube answered ${res.status}${said}`) };
}

const failure = ({ kind, reason }: Failure) => ({ ok: false as const, kind, reason });

export async function lookUpVideo(videoId: string, apiKey: string, opts: Opts = {}): Promise<VideoLookup> {
  const r = await getJson(`${API}/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`, apiKey, opts);
  if (!r.ok) return failure(r);
  const snippet = Array.isArray(r.body?.items) ? r.body.items[0]?.snippet : undefined;
  if (!snippet) return { ok: false, kind: 'not_found', reason: 'YouTube has no public video at that link.' };
  return {
    ok: true, title: text(snippet.title), channel: text(snippet.channelTitle), channelId: text(snippet.channelId),
    description: text(snippet.description),
  };
}

/** Up to `max` comment threads (relevance order, plain text) → each one's top-level comment. Replies are never read. */
export async function lookUpComments(videoId: string, apiKey: string, max: number, opts: Opts = {}): Promise<CommentsLookup> {
  const r = await getJson(`${API}/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&order=relevance` +
    `&maxResults=${max}&textFormat=plainText&key=${encodeURIComponent(apiKey)}`, apiKey, opts);
  if (!r.ok) {
    return r.kind === 'failed' && r.reasons.includes('commentsDisabled')
      ? { ok: false, kind: 'none', reason: 'Comments are turned off for this video.' } : failure(r);
  }
  const items: any[] = Array.isArray(r.body?.items) ? r.body.items : [];
  const comments = items.map((item) => item?.snippet?.topLevelComment?.snippet).filter((s) => s && typeof s.textDisplay === 'string')
    .map((s): VideoComment => ({ authorChannelId: text(s.authorChannelId?.value), text: s.textDisplay }));
  return { ok: true, comments };
}
