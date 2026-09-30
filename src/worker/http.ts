import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
