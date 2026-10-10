// SPEC §9.2b — whether the house is quiet now, read for the three writers of house rows (tick step 2,
// timer starts, POST /announce) and GET /house/quiet. D1 reads only: no Hono, never writes, never speaks.
import { quietState } from '../shared/house-quiet';
import { first } from './db';

export interface HouseQuiet { until: string; byName: string | null }

/** The quiet in force at `now`, with the setter's name, or null when the speakers may speak. */
export async function houseQuiet(db: D1Database, now: string): Promise<HouseQuiet | null> {
  const r = await first<{ until: string | null; byName: string | null }>(db,
    `SELECT s.house_quiet_until AS until, m.display_name AS byName FROM settings s
      LEFT JOIN members m ON m.id = s.house_quiet_by WHERE s.id = 1`);
  const until = quietState(r?.until ?? null, now);
  return until ? { until, byName: r!.byName } : null;
}
