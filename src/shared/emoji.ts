// SPEC §7.6 — the one-emoji rule: an event's emoji is one grapheme of emoji presentation
// within a byte cap; and the guess from a title or name. Pure; imports nothing.

export const EMOJI_MAX_BYTES = 16;

// Not \p{Emoji} (lets "1" and "#" through) nor \p{Emoji_Presentation} (rejects 🗑️ = U+1F5D1 U+FE0F).
const EMOJI_START = /^[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/** null when `v` is a single emoji, else a message for the person. */
export function emojiError(v: unknown): string | null {
  const msg = 'Emoji must be a single emoji, like 🧹.';
  if (typeof v !== 'string' || v.length === 0) return msg;
  if (new TextEncoder().encode(v).length > EMOJI_MAX_BYTES) return msg;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v)];
  if (graphemes.length !== 1) return msg;
  return EMOJI_START.test(v) ? null : msg;
}

// §7.6 Guessed emoji, §7A.1 — the one table events and lists guess from ⚑ Q376–Q377. A word must start a word
// and, unless it ends in *, end one too ("cat" never finds "vacation" or "catch"); the first row that matches wins.
const GUESS_TABLE: readonly [string, string][] = [
  ['shop* grocer* store* market* costco target walmart', '🛒'],
  ['birthday* bday* b-day*', '🎂'],
  ['wish* gift* present* christmas xmas', '🎁'],
  ['flight* fly flying airport* plane*', '✈️'],
  ['pack packing trip* travel* vacation* hotel*', '🧳'],
  ['camp camping campout', '⛺'],
  ['dentist* dental teeth tooth orthodont* braces', '🦷'],
  ['optometr* glasses contacts', '👓'],
  ['vet vets grooming groomer pet pets dog dogs cat cats puppy kitten', '🐾'],
  ['doctor* dr checkup* check-up* physical pediatric* clinic*', '🩺'],
  ['hospital* surgery', '🏥'],
  ['pharmacy medicine* meds prescription* refill*', '💊'],
  ['vaccin* shot shots', '💉'],
  ['therap* counsel*', '🛋️'],
  ['haircut* hair barber* salon', '💇'],
  ['nail nails manicure* pedicure*', '💅'],
  ['soccer', '⚽'],
  ['basketball', '🏀'],
  ['baseball softball t-ball', '⚾'],
  ['football', '🏈'],
  ['tennis pickleball', '🎾'],
  ['volleyball', '🏐'],
  ['golf*', '⛳'],
  ['swim* pool', '🏊'],
  ['surf*', '🏄'],
  ['beach*', '🏖️'],
  ['hike hiking trail*', '🥾'],
  ['bike* biking cycling', '🚲'],
  ['run running 5k 10k marathon* jog*', '🏃'],
  ['gym workout* crossfit', '🏋️'],
  ['yoga', '🧘'],
  ['karate martial jiu-jitsu jiu taekwondo judo', '🥋'],
  ['dance* dancing ballet', '💃'],
  ['gymnastic*', '🤸'],
  ['piano', '🎹'],
  ['guitar*', '🎸'],
  ['violin*', '🎻'],
  ['music* band choir concert* recital* lesson*', '🎵'],
  ['movie* cinema film*', '🎬'],
  ['theater* theatre* play musical show', '🎭'],
  ['game* gaming', '🎮'],
  ['party parties celebrat*', '🎉'],
  ['wedding*', '💒'],
  ['anniversary date', '💕'],
  ['shower', '🍼'],
  ['funeral* memorial*', '🕯️'],
  ['church mass', '⛪'],
  ['graduat*', '🎓'],
  ['school* class* homework kid kids pta teacher* conference*', '🎒'],
  ['test exam* quiz*', '📝'],
  ['book* library read reading', '📚'],
  ['trash garbage recycl* bins', '🗑️'],
  ['sweep* sweeping', '🧹'],
  ['clean* tidy vacuum* mop dust*', '🧽'],
  ['laundry', '🧺'],
  ['garden* plant* yard lawn mow mowing', '🌱'],
  ['hardware tool tools fix fixing repair* plumber* electrician* handyman', '🔨'],
  ['car oil mechanic tire* smog dmv', '🚗'],
  ['gas fuel', '⛽'],
  ['bank* tax taxes bill bills pay rent mortgage', '💵'],
  ['work meeting* interview* office', '💼'],
  ['call phone', '📞'],
  ['breakfast brunch', '🥞'],
  ['lunch*', '🥪'],
  ['bbq barbecue grill*', '🍖'],
  ['pizza*', '🍕'],
  ['coffee', '☕'],
  ['dinner* restaurant* meal* food cook* potluck dishes eat', '🍽️'],
  ['bake* baking cookie* cake* cupcake*', '🧁'],
  ['halloween trick-or-treat*', '🎃'],
  ['thanksgiving', '🦃'],
  ['easter', '🐣'],
  ['valentine*', '💝'],
  ['fireworks', '🎆'],
  ['zoo', '🦁'],
  ['aquarium', '🐠'],
  ['museum*', '🏛️'],
  ['disney* disneyland legoland amusement', '🎢'],
  ['fish fishing', '🎣'],
  ['goat* chicken* farm*', '🐐'],
  ['sleepover* playdate* play-date*', '🧸'],
  ['pickup pick-up carpool* dropoff drop-off drive', '🚙'],
  ['grandma grandpa nana papa family', '👪'],
  ['house home move moving', '🏠'],
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => (w.endsWith('*') ? escapeRe(w.slice(0, -1)) : `${escapeRe(w)}(?![\\p{L}\\p{N}])`);
const GUESS_RES = GUESS_TABLE.map(([words, emoji]) =>
  [new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.split(' ').map(wordRe).join('|')})`, 'u'), emoji] as const);

/** The emoji a title or name suggests, else null (§7.6 Guessed emoji). */
export function guessEmoji(text: string): string | null {
  const key = text.toLowerCase();
  return GUESS_RES.find(([re]) => re.test(key))?.[1] ?? null;
}

/** Every emoji the table can give, so a test can hold each to the one-emoji rule. */
export const GUESSABLE_EMOJIS: readonly string[] = [...new Set(GUESS_TABLE.map(([, e]) => e))];
