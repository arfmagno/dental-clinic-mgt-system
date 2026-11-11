import crypto from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);

export interface StoredPin {
  pinSalt: string;
  pinHash: string;
  pinIterations: number;
}

/** Bounds on the work factor a stored row may ask for (a hostile row must not stall the server). */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 2_000_000;

/**
 * Checks a staff PIN against the PBKDF2-SHA-256 hash the app stores on the staff row
 * (services/web/src/services/pinService.ts: 16-byte salt, 32-byte key). Constant-time compare.
 */
export async function pinMatches(pin: string, stored: StoredPin): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin) || !stored.pinHash || !stored.pinSalt) return false;
  if (!Number.isInteger(stored.pinIterations) || stored.pinIterations < MIN_ITERATIONS || stored.pinIterations > MAX_ITERATIONS) return false;
  const expected = Buffer.from(stored.pinHash, 'base64');
  if (expected.length !== 32) return false;
  const given = await pbkdf2(pin, Buffer.from(stored.pinSalt, 'base64'), stored.pinIterations, 32, 'sha256');
  return crypto.timingSafeEqual(given, expected);
}
