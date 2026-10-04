// SPEC §9.3 — house announcements: the length limit, input validation and the spoken text.
// Pure; imports nothing but vocab.
import { CHANNEL, isOneOf } from './vocab';

/** Longest announcement, in characters after trimming. ⚑ Q36 */
export const ANNOUNCE_MAX = 200;

/** The push title of an announcement (§9.1 — a delivery with no fire). */
export const ANNOUNCE_TITLE = '📢 Announcement';

/** Why an announcement can't be sent, or null: text trimmed 1..ANNOUNCE_MAX, channels a non-empty set of CHANNEL. */
export function announceError(input: { text: unknown; channels: unknown }): string | null {
  const { text, channels } = input;
  if (typeof text !== 'string' || text.trim().length === 0) return 'Write a message to announce.';
  if (text.trim().length > ANNOUNCE_MAX) return `Keep the message to ${ANNOUNCE_MAX} characters.`;
  if (!Array.isArray(channels) || channels.length === 0) return 'Pick at least one way to announce (Phone or House).';
  if (!channels.every((c) => isOneOf(CHANNEL, c))) return `Channels must be from: ${CHANNEL.join(', ')}.`;
  if (new Set(channels).size !== channels.length) return 'Each channel at most once.';
  return null;
}

/** What the house speaks and the push shows: "{name} says: {text}". */
export const announceMessage = (name: string, text: string) => `${name} says: ${text.trim()}`;
