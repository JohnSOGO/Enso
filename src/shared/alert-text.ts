// SPEC §5.7 — alert message text: the one sentence a fire speaks or pushes, per kind (§7.7 sun, §7.10 bring, §8.17 clock).
// Pure: imports vocab types, time.clockText and bring.bringText only; the engine never imports it (moved out of
// engine.ts 2026-11-23, steward finding, MojoSOGO TDY).
import type { AlertKind, SunEvent } from './vocab';
import { clockText } from './time';
import { bringText } from './bring';

/** Who a chore alert names and which step it is on (§5.7). */
export interface ChoreAlertText { personName: string | null; stepTitle: string; stepCount: number }

/** §7.7 — a sun reminder's local sunrise / sunset HH:MM (null: not computable), and the text when it is null. */
export interface SunAt { at: SunEvent; time: string | null }
const SUN_UNKNOWN: Record<SunEvent, string> = { sunrise: 'sunrise', sunset: 'before sunset' };
/**
 * §5.7 — alert message text. `startsToday`: a thing's start reminder (§7C.2). `sun`: a sun reminder's sunrise or
 * sunset, local HH:MM or null when it cannot be computed (§7.7); absent otherwise. `clock24h`: the
 * receiving member's clock (§8.17).
 */
export function alertMessage(
  kind: AlertKind, title: string, alertNumber: number, chore?: ChoreAlertText, startsToday = false, sun?: SunAt,
  bring?: string[] | null, clock24h = false,
): string {
  const base = kind === 'reminder'
    ? (sun ? `${title} — ${sun.time === null ? SUN_UNKNOWN[sun.at] : `${sun.at} at ${clockText(sun.time, clock24h)}`}` : `Reminder: ${title}`)
      + (bring?.length ? ` — ${bringText(bring)}` : '')
    : kind === 'timer' ? `Timer: ${title}`
    : kind === 'thing' ? `To do: ${title}${startsToday ? ' — starts today' : ''}`
    : kind === 'machine' ? title // the whole sentence, from machines.ts doneMessage (§7D.3)
    : `${chore?.personName ? `Chore for ${chore.personName}` : 'Chore'}: ${title}${chore && chore.stepCount > 1 ? ` — ${chore.stepTitle}` : ''}`;
  return alertNumber >= 2 ? `${base} (alert ${alertNumber})` : base;
}
