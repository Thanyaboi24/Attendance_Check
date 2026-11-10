import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/** argon2id salted password hash (DS2 §2.4). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) {
    // Spend comparable time so response timing does not reveal whether the account exists.
    await argon2.hash(password, { type: argon2.argon2id });
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** 32 random bytes, URL-safe. Only the SHA-256 hash is stored. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
