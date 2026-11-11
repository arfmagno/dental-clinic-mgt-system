/**
 * PIN hashing and the device's lock state. Each staff member has their own PIN, stored only as a
 * salted PBKDF2-SHA-256 hash on their staff row (which syncs, so they can sign in on any device).
 * The PIN gates the UI; it does not encrypt the local database (protect the device with its own login).
 */
const FAIL_KEY = 'clinic.pinFailures';
const SESSION_KEY = 'clinic.unlocked';
const LOCK_KEY = 'clinic.lockMode';
const LAST_KEY = 'clinic.lastStaff';

export const PIN_PATTERN = /^\d{4,6}$/;
export const PIN_ITERATIONS = 210_000;
const FREE_ATTEMPTS = 5;

export interface PinHash {
  pinSalt: string;
  pinHash: string;
  pinIterations: number;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function read<T>(storage: Storage, key: string): T | null {
  try {
    const v = storage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: Storage, key: string, value: unknown) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinHash> {
  if (!PIN_PATTERN.test(pin)) throw new Error('PIN must be 4 to 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { pinSalt: b64(salt), pinHash: b64(await derive(pin, salt, iterations)), pinIterations: iterations };
}

/** Constant-time comparison of a PIN against a stored hash. An account without a hash never matches. */
export async function pinMatches(pin: string, stored: PinHash): Promise<boolean> {
  if (!stored.pinHash || !stored.pinSalt || !stored.pinIterations) return false;
  const given = await derive(pin, unb64(stored.pinSalt), stored.pinIterations);
  const expected = unb64(stored.pinHash);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.min(given.length, expected.length); i++) diff |= given[i] ^ expected[i];
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; waitSeconds: number; attemptsLeft: number };

/**
 * Checks a staff member's PIN with an increasing wait after repeated failures on this device
 * (30 s, 60 s, … up to 15 min), counted per staff member.
 */
export async function verifyStaffPin(staffId: string, pin: string, stored: PinHash, now = Date.now()): Promise<VerifyResult> {
  const all = read<Record<string, { count: number; until: number }>>(localStorage, FAIL_KEY) ?? {};
  const fails = all[staffId] ?? { count: 0, until: 0 };
  if (now < fails.until) return { ok: false, waitSeconds: Math.ceil((fails.until - now) / 1000), attemptsLeft: 0 };
  if (await pinMatches(pin, stored)) {
    delete all[staffId];
    write(localStorage, FAIL_KEY, all);
    return { ok: true };
  }
  const count = fails.count + 1;
  const until = count >= FREE_ATTEMPTS ? now + Math.min(30_000 * 2 ** (count - FREE_ATTEMPTS), 15 * 60_000) : 0;
  all[staffId] = { count, until };
  write(localStorage, FAIL_KEY, all);
  return { ok: false, waitSeconds: until ? Math.ceil((until - now) / 1000) : 0, attemptsLeft: Math.max(0, FREE_ATTEMPTS - count) };
}

/** Forgets the failure count for one person (after an admin resets their PIN). */
export function clearFailures(staffId: string) {
  const all = read<Record<string, unknown>>(localStorage, FAIL_KEY) ?? {};
  delete all[staffId];
  write(localStorage, FAIL_KEY, all);
}

// ---- who is signed in for this session (closing the app/browser signs out) ----
export const sessionStaffId = (): string | null => read<string>(sessionStorage, SESSION_KEY);
export const setSessionStaffId = (id: string | null) => write(sessionStorage, SESSION_KEY, id);

/** The last person who signed in on this device: pre-selected on the sign-in screen. */
export const lastStaffId = (): string | null => read<string>(localStorage, LAST_KEY);
export const setLastStaffId = (id: string) => write(localStorage, LAST_KEY, id);

// ---- patient-isolation lock (survives reloads, so a patient cannot escape by refreshing) ----
export type LockMode = 'patient' | null;
export const getLockMode = (): LockMode => (read<string>(localStorage, LOCK_KEY) === 'patient' ? 'patient' : null);
export const setLockMode = (m: LockMode) => write(localStorage, LOCK_KEY, m);
