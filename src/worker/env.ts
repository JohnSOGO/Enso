export interface Env {
  DB: D1Database;
  SETUP_TOKEN?: string;
  RELAY_TOKEN?: string;
  DEV_ENDPOINTS?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export interface SessionMember {
  id: string;
  email: string;
  display_name: string;
  color: string;
  role: 'owner' | 'member';
}

export type AppEnv = { Bindings: Env; Variables: { member: SessionMember } };

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      SETUP_TOKEN: string;
      RELAY_TOKEN: string;
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
    }
  }
}
