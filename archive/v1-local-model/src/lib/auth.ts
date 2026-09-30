// src/lib/auth.ts — JWT token management and invite code utilities

import { SignJWT, jwtVerify } from 'jose';

export interface JWTPayload {
  sub: string;       // user_id (member.id)
  household_id: string;
  role: 'owner' | 'admin' | 'member';
  iat?: number;
  exp?: number;
}

/** Get the crypto key for JWT signing/verification */
async function getJWTKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-production'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

/** Generate a JWT for the given user */
export async function generateJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  const secret = await getJWTKey('sign');

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

/** Verify and decode a JWT */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  const secret = await getJWTKey('verify');

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/** Generate a random invite code in format XXXX-XXXX-XXXX */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Hash an invite code for storage */
export async function hashInviteCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(code.toLowerCase().trim()));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an invite code against its hash */
export async function verifyInviteCode(input: string, storedHash: string): Promise<boolean> {
  const inputHash = await hashInviteCode(input);
  return crypto.subtle.timingSafeEqual(
    new TextEncoder().encode(inputHash),
    new TextEncoder().encode(storedHash)
  );
}

/** Generate a random UUID v4 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
