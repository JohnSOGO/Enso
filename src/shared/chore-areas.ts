// SPEC §7B.6 — what done looks like: a chore's areas (name, expectations, reference photos). Limits, input
// validation and the wire type. Pure; imports nothing.

export const AREAS_MAX = 8;
export const AREA_NAME_MAX = 40;
export const EXPECTATIONS_MAX = 12;
export const EXPECTATION_MAX = 120;
export const AREA_PHOTOS_MAX = 4;

/** An area as the API sends it. `photos` are photo ids, oldest first; a photo key is never on the wire. */
export interface ChoreArea {
  id: string;
  choreId: string;
  name: string;
  expectations: string[];
  photos: string[];
  updatedAt: string;
}

export interface AreaInput { name: string; expectations: string[] }

/** POST/PATCH body → the area's fields, or a message naming the field. `current` fills what a PATCH leaves out. */
export function parseAreaInput(b: Record<string, unknown>, current?: AreaInput): AreaInput | string {
  const rawName = b.name === undefined && current ? current.name : b.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > AREA_NAME_MAX) return `name must be 1–${AREA_NAME_MAX} characters.`;
  const raw = b.expectations === undefined || b.expectations === null ? current?.expectations ?? [] : b.expectations;
  if (!Array.isArray(raw) || !raw.every((e) => typeof e === 'string')) return 'expectations must be a list of text.';
  const expectations = (raw as string[]).map((e) => e.trim()).filter(Boolean);
  if (expectations.some((e) => e.length > EXPECTATION_MAX)) return `expectations: each can be at most ${EXPECTATION_MAX} characters.`;
  if (expectations.length > EXPECTATIONS_MAX) return `expectations: an area has at most ${EXPECTATIONS_MAX}.`;
  return { name, expectations };
}
