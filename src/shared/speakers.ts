// SPEC §9.2a — each person's house speakers: what a speaker is (its HA entity id's prefix), what a valid
// choice is, and which speakers one house delivery is spoken on. Pure; the choices and HA's list are data.
import type { SpeakerKind } from './vocab';

export const SPEAKERS_MAX = 20;
export const SPEAKERS_ERROR = 'Speakers must be a list of Home Assistant speaker ids, or null.';

/** A speaker to tick, as Home Assistant lists it (the wire type of GET /house/speakers). */
export interface Speaker { id: string; name: string; kind: SpeakerKind }

const PREFIX: Record<SpeakerKind, string> = { echo: 'media_player', satellite: 'assist_satellite' };

/** `media_player.<slug>` → echo, `assist_satellite.<slug>` → satellite, anything else → null. */
export function speakerKind(id: unknown): SpeakerKind | null {
  if (typeof id !== 'string') return null;
  const m = /^([a-z_]+)\.[a-z0-9_]+$/.exec(id);
  if (!m) return null;
  return (Object.keys(PREFIX) as SpeakerKind[]).find((k) => PREFIX[k] === m[1]) ?? null;
}

/** null (back to not chosen), or up to SPEAKERS_MAX distinct speaker ids ([] = no speaker) → null; else the message. */
export function speakersError(v: unknown): string | null {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length > SPEAKERS_MAX || new Set(v).size !== v.length) return SPEAKERS_ERROR;
  return v.every((id) => speakerKind(id) !== null) ? null : SPEAKERS_ERROR;
}

/**
 * The speakers of one house delivery, from the choices of everyone it is for: anyone not chosen → null
 * (the default speakers); nobody at all → null, as before; otherwise the union in first-seen order.
 */
export function speakersFor(choices: readonly (readonly string[] | null)[]): string[] | null {
  if (choices.length === 0 || choices.some((c) => c === null)) return null;
  return [...new Set(choices.flatMap((c) => c!))];
}

/** A row's speakers by kind: the Echo `target` and the Voice PE `entity_id` lists. */
export function splitSpeakers(ids: readonly string[]): Record<SpeakerKind, string[]> {
  return { echo: ids.filter((id) => speakerKind(id) === 'echo'), satellite: ids.filter((id) => speakerKind(id) === 'satellite') };
}

/** §9.2a Q130 — Alexa Media Player lists the Alexa apps too; these names are not speakers. */
const notASpeaker = (name: string) => /^this device$/i.test(name) || /alexa app/i.test(name);

/** Home Assistant's template answer → its speakers (apps dropped), Echos first then by name; not a JSON array → null. */
export function speakerList(text: string): Speaker[] | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: Speaker[] = [];
  for (const e of raw as { id?: unknown; name?: unknown }[]) {
    const kind = speakerKind(e?.id);
    if (!kind || seen.has(e.id as string)) continue;
    seen.add(e.id as string);
    const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : (e.id as string);
    if (notASpeaker(name)) continue;
    out.push({ id: e.id as string, name, kind });
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'echo' ? -1 : 1));
}
