// SPEC §6.2a — the invite link format: `{origin}/join#{code}`. Pure; normalizeInviteCode is the server's; the PWA sends the code as typed.

/** The path of the join page; the code rides in the fragment so it never reaches the server. */
export const JOIN_PATH = '/join';

/** §6.2 — uppercase, strip dashes/spaces, I/L→1, O→0. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** The link the invite card shares, copies and draws as a QR. */
export function inviteLink(origin: string, code: string): string {
  return `${origin}${JOIN_PATH}#${code}`;
}

/** The code from a pasted whole link (the part after `#`) or from a bare typed code. */
export function inviteCodeFrom(text: string): string {
  const hash = text.indexOf('#');
  return (hash >= 0 ? text.slice(hash + 1) : text).trim();
}
