import type { Role } from '../shared/vocab';
import type { SpeechAi } from './speech-to-text';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  AI?: SpeechAi; // §8.18 part 2 Workers AI (speech to text), the [ai] binding in wrangler.toml
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
  BUILD_FIRE_URL?: string; // §8.18 part 6 Build now: the build routine's fire address
  BUILD_FIRE_TOKEN?: string; // its bearer (a secret)
  WEATHER_URL?: string; // §7.11 the Open-Meteo base address; empty = no weather
  TIDES_URL?: string; // §7.14 the NOAA CO-OPS base address; empty = no coast data (no fishing windows)
  MARINE_URL?: string; // §7.14 the Open-Meteo marine base address; empty = waves unknown
  FISH_PLANTS_URL?: string; // §7.14b the CDFW trout plants query (GeoJSON); empty = none
  PARKS_ICAL_URL?: string; // §7.14b the county parks' events calendar (iCal); empty = none
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
