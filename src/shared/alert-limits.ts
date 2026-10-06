// SPEC §4.2, §4.2a, §5.4 — the input limits of the things that ring, shared by the routes and the forms. Pure.

/** Title of an event, alarm or timer: at most this many characters. */
export const ALERT_TITLE_MAX = 120;
/** A timer's interval, in whole minutes. */
export const TIMER_INTERVAL_MIN = 1;
export const TIMER_INTERVAL_MAX = 1440;
/** An event's notes: at most this many characters. */
export const EVENT_NOTES_MAX = 2000;
