// SPEC §8.4, §7.6 Guessed emoji — an event's Emoji box. A new event's box shows guessEmoji(title) until the person
// types in it or clears it (then `own`); the ✨ guessed note says it is a guess. value/onChange only; never saves.
import { guessEmoji } from '../../../src/shared/emoji';

/** What the box shows and what Save sends: the person's own, else the title's guess. ⚑ Q376 */
export const shownEmoji = (value: string, own: boolean, title: string): string => (own ? value : guessEmoji(title) ?? '');

export function EventEmojiField({ value, own, title, onChange }: { value: string; own: boolean; title: string; onChange: (emoji: string) => void }) {
  const shown = shownEmoji(value, own, title);
  return (
    <label className="field"><span>Emoji (optional){!own && shown && <span className="muted"> ✨ guessed</span>}</span>
      <input value={shown} onChange={(e) => onChange(e.target.value)} placeholder="🧹" style={{ width: '5rem' }} />
    </label>
  );
}
