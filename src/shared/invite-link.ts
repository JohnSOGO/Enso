// SPEC §6.2a — the invite link format: `{origin}/join#{code}`. Pure; normalization stays on the server.

/** The path of the join page; the code rides in the fragment so it never reaches the server. */
export const JOIN_PATH = '/join';

/** The link the invite card shares, copies and draws as a QR. */
export function inviteLink(origin: string, code: string): string {
  return `${origin}${JOIN_PATH}#${code}`;
}

/** The code from a pasted whole link (the part after `#`) or from a bare typed code. */
export function inviteCodeFrom(text: string): string {
  const hash = text.indexOf('#');
  return (hash >= 0 ? text.slice(hash + 1) : text).trim();
}
