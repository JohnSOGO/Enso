import type { Role } from '../shared/vocab';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  SETUP_TOKEN?: string;
  DEV_ENDPOINTS?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  ANTHROPIC_API_KEY?: string;
  YOUTUBE_API_KEY?: string; // §7E recipes from videos
  CAPTIONS_TOKEN?: string; // §7E.2c the bearer the Worker sends to the SogoAI helper
  HOME_CAPTIONS_URL?: string; // §7E.2c where the SogoAI helper is reached (through Access + the sogoai tunnel)
  OPS_NOTIFY_TOKEN?: string; // §9.4 the bearer a Claude Code session sends to POST /ops/notify
  // §9.2 House delivery — vars in wrangler.toml, the three secrets via `wrangler secret put`.
  HA_URL?: string;
  ECHO_TARGETS?: string[];
  ECHO_TYPE?: string;
  SATELLITE_ENTITY?: string;
  HA_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

export interface SessionMember {
  id: string;
  email: string;
  display_name: string;
  color: string;
  role: Role;
}

export type AppEnv = { Bindings: Env; Variables: { member: SessionMember } };

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      PHOTOS: R2Bucket;
      SETUP_TOKEN: string;
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
    }
  }
}
