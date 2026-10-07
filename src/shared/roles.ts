// SPEC §6.3 — what a member's role allows (pure). Feature-specific permission rules stay in
// their feature module and take `admin: isAdmin(m)`.
import type { Role } from './vocab';

/** Admins are members with role 'owner' (§6.3). Typed by Role, so a vocabulary change breaks the build. */
export const ADMIN_ROLE: Role = 'owner';

/** Whether a member reads Admin (§6.3). */
export const isAdmin = (member: { role: Role }): boolean => member.role === ADMIN_ROLE;

/** Who may change a thing (event, alarm, timer, chore, list): its creator or an admin; no creator → admins only. */
export function canChange(createdBy: string | null, member: { id: string; role: Role }): boolean {
  return member.role === ADMIN_ROLE || (createdBy !== null && createdBy === member.id);
}

/** §6.3 — the one refusal sentence when canChange says no, for the routes and the read-only forms. */
export const cannotChangeText = (noun: string): string => `Only the creator or an admin can change this ${noun}.`;
