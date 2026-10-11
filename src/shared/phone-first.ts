// SPEC §9.2d — phone first, then the house: whether one alert of a fire gets a house row. Pure; engine never imports it.
import type { AlertConfig } from './engine';

/** House ticked and (House only, alert 2 on, or a first alert that will not alert again) — else the phones go first. */
export function speaksOnHouse(alertNumber: number, cfg: Pick<AlertConfig, 'channels' | 'renotifyMin' | 'maxAlerts'>): boolean {
  if (!cfg.channels.includes('house')) return false;
  if (!cfg.channels.includes('push') || alertNumber >= 2) return true;
  return cfg.renotifyMin === null || cfg.maxAlerts <= 1;
}
