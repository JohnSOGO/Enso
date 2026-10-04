// SPEC §9.4 — pinging the founder's phone from outside (a Claude Code session): the limits, input
// validation, the title and the hourly window. Pure; imports nothing.

/** Longest ping text, in characters after trimming. */
export const OPS_TEXT_MAX = 200;

/** Longest ping title, in characters after trimming. ⚑ Q108 */
export const OPS_TITLE_MAX = 60;

/** The push title when the caller sends none. ⚑ Q108 */
export const OPS_TITLE_DEFAULT = '🤖 Claude';

/** Pings allowed in any one hour, then 429. ⚑ Q110 */
export const OPS_NOTIFY_PER_HOUR = 30;

/** Why a ping can't be sent, or null: text trimmed 1..OPS_TEXT_MAX; title absent, or a string trimmed ≤ OPS_TITLE_MAX. */
export function opsNotifyError(input: { text: unknown; title?: unknown }): string | null {
  const { text, title } = input;
  if (typeof text !== 'string' || text.trim().length === 0) return 'Write a message to send.';
  if (text.trim().length > OPS_TEXT_MAX) return `Keep the message to ${OPS_TEXT_MAX} characters.`;
  if (title === undefined || title === null) return null;
  if (typeof title !== 'string') return 'title must be a string.';
  if (title.trim().length > OPS_TITLE_MAX) return `Keep the title to ${OPS_TITLE_MAX} characters.`;
  return null;
}

/** The trimmed title, or OPS_TITLE_DEFAULT when it is absent or blank. */
export function opsTitle(title?: unknown): string {
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : OPS_TITLE_DEFAULT;
}

/** The start of the hourly window: the ISO instant one hour before `now`. */
export function opsWindowStart(now: string): string {
  return new Date(Date.parse(now) - 60 * 60 * 1000).toISOString();
}
