// SPEC §8.18 part 2 ⚑ Q378 — writes down a recorded clip via the Workers AI binding (Whisper): the clip as base64 →
// the words, or an honest failure. Each call is handed to the route's Meter (§9.4c): the clip's size and, when Whisper
// says it, its length. No Hono, no D1; never stores or logs the clip or the words.
import { noUse, type Meter } from '../shared/model-usage';

export const HEAR_MODEL = '@cf/openai/whisper-large-v3-turbo';

/** The bit of the Workers AI binding used here, so a test can pass a fake. */
export interface SpeechAi { run(model: string, input: { audio: string }): Promise<unknown> }

function base64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function hearClip(ai: SpeechAi, bytes: ArrayBuffer, meter?: Meter): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const started = Date.now();
  const metered = async (ok: boolean, seconds: unknown) => meter?.({
    ...noUse('workers-ai', HEAR_MODEL, ok, Date.now() - started), audioBytes: bytes.byteLength,
    audioSeconds: typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
  });
  try {
    const out = await ai.run(HEAR_MODEL, { audio: base64(bytes) }) as { text?: unknown; transcription_info?: { duration?: unknown } } | null;
    const text = typeof out?.text === 'string' ? out.text.replace(/\s+/g, ' ').trim() : null;
    await metered(text !== null, out?.transcription_info?.duration);
    return text === null ? { ok: false, reason: 'no words came back' } : { ok: true, text };
  } catch (e) {
    await metered(false, null);
    return { ok: false, reason: e instanceof Error ? e.message : 'the speech-to-text failed' };
  }
}
