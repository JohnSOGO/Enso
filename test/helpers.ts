import { SELF, env } from 'cloudflare:test';

export const BASE = 'https://hrc.test/api/v1';
export const OWNER = { email: 'owner@example.com', password: 'owner-password-1', displayName: 'MojoSOGO' };

export class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await SELF.fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown, h?: Record<string, string>) => this.req('POST', p, b ?? {}, h);
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  put = (p: string, b: unknown) => this.req('PUT', p, b);
  del = (p: string) => this.req('DELETE', p);
}

/** Creates the owner if needed, else logs in. */
export async function owner(): Promise<Client> {
  const c = new Client();
  const r = await c.post('/setup', { setupToken: env.SETUP_TOKEN, ...OWNER });
  if (r.status === 410) {
    const l = await c.post('/auth/login', OWNER);
    if (l.status !== 200) throw new Error(`owner login failed: ${JSON.stringify(l.json)}`);
  } else if (r.status !== 201) {
    throw new Error(`setup failed: ${JSON.stringify(r.json)}`);
  }
  return c;
}

let n = 0;
/** Invites and signs up a new member. */
export async function member(ownerClient: Client): Promise<{ client: Client; id: string }> {
  const inv = await ownerClient.post('/invites', { displayName: `Member ${++n}` });
  const c = new Client();
  const r = await c.post('/auth/signup', { code: inv.json.code, email: `m${n}-${Date.now()}@example.com`, password: 'member-password-1', displayName: `Member ${n}` });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.json)}`);
  return { client: c, id: r.json.id };
}

export const tickAt = (c: Client, iso: string) => c.post(`/dev/tick?now=${encodeURIComponent(iso)}`);
