import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '../shared/things';
import { isOneOf } from '../shared/vocab';

/** Every error response: { error, message } with a non-empty message (SPEC §10). */
export function fail(c: Context, status: ContentfulStatusCode, error: string, message: string) {
  return c.json({ error, message: message || error }, status);
}

export async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;

export const optStr = (v: unknown, max = 2000): string | null | undefined =>
  v === undefined ? undefined : v === null || v === '' ? null : typeof v === 'string' && v.length <= max ? v : undefined;

export const intIn = (v: unknown, lo: number, hi: number): number | null =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null;

const PHOTO_MB = PHOTO_MAX_BYTES / (1024 * 1024);

/** The raw image body, or a 400 naming what is wrong with it (§7C.3). */
export async function photoBody(c: Context): Promise<{ bytes: ArrayBuffer; type: string } | Response> {
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!isOneOf(PHOTO_TYPES, type)) return fail(c, 400, 'invalid_input', `The photo must be one of: ${PHOTO_TYPES.join(', ')}.`);
  const tooBig = () => fail(c, 400, 'invalid_input', `The photo is too large: at most ${PHOTO_MB} MB.`);
  if (Number(c.req.header('content-length') ?? 0) > PHOTO_MAX_BYTES) return tooBig();
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength > PHOTO_MAX_BYTES) return tooBig();
  if (bytes.byteLength === 0) return fail(c, 400, 'invalid_input', 'The photo is empty.');
  return { bytes, type };
}
