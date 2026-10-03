// SPEC §7B — chore rules (pure): whose turn, run planning, step advance/undo, a chore
// fire's config, input validation. `now` and `tz` are always parameters.
import type { Channel, ChoreTiming, Weekday } from './vocab';

export const TITLE_MAX = 60;
export const DONE_MEANS_MAX = 200;
export const PEOPLE_MAX = 8;
export const STEPS_MAX = 6;
export const WAIT_MAX = 720;

/** §7B.2 — one step of a chore's loop. */
export interface ChoreStep {
  title: string;
  waitMin: number | null;  // after THIS step is done, the next step rings in N min
  memberId: string | null; // this step's person; null = whoever's turn it is
}

/** A chore with its JSON columns parsed. */
export interface Chore {
  id: string;
  title: string;
  done_means: string | null;
  days: Weekday[];
  timing: ChoreTiming;
  time: string;
  nudge: boolean;
  people: string[];
  steps: ChoreStep[];
  channels: Channel[];
  renotify_min: number | null;
  max_alerts: number;
  start_date: string;
}
