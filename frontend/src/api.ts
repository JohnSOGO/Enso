// Fetch wrapper: every failure becomes an ApiError with a human message that names the status.

export class ApiError extends Error {
  constructor(public status: number | null, public code: string, message: string) {
    super(message);
  }
}

/** The Worker's URL for a path — also for `<img src>` of a private photo (the session cookie goes along). */
export const apiUrl = (path: string) => `/api/v1${path}`;

export function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  return send<T>(method, path, body === undefined ? {} : { 'content-type': 'application/json' },
    body === undefined ? undefined : JSON.stringify(body));
}

/** A raw body (e.g. a photo) sent with its own content type (§10 PUT /things/{id}/photo, POST /things/read-photo). */
export const upload = <T = any>(method: string, path: string, blob: Blob) =>
  send<T>(method, path, { 'content-type': blob.type || 'application/octet-stream' }, blob);

async function send<T>(method: string, path: string, headers: Record<string, string>, body: BodyInit | undefined): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, credentials: 'same-origin', headers, body });
  } catch {
    throw new ApiError(null, 'network', 'Could not reach the server — check your connection.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const message = json?.message || `Request failed (HTTP ${res.status}${json?.error ? `, ${json.error}` : ''}).`;
    console.warn('api error', method, path, res.status, json);
    throw new ApiError(res.status, json?.error ?? 'http_error', message);
  }
  return json as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const put = <T = any>(p: string, b: unknown) => api<T>('PUT', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
