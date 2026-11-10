/**
 * Staff PIN: opens the app on this device and unlocks the patient-isolation lock. Works fully
 * offline. Stored only as a salted PBKDF2 hash. It gates the UI; it does not encrypt the local
 * database (protect the device itself with its own login).
 */
const PIN_KEY = 'clinic.pin';
const FAIL_KEY = 'clinic.pinFailures';
const SESSION_KEY = 'clinic.unlocked';
const LOCK_KEY = 'clinic.lockMode';

export const PIN_PATTERN = /^\d{4,6}$/;
const ITERATIONS = 210_000;
const FREE_ATTEMPTS = 5;

interface StoredPin {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
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

export const hasPin = () => read<StoredPin>(localStorage, PIN_KEY) !== null;

export async function setPin(pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new Error('PIN must be 4 to 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  write(localStorage, PIN_KEY, { v: 1, salt: b64(salt), hash: b64(hash), iterations: ITERATIONS } satisfies StoredPin);
  write(localStorage, FAIL_KEY, null);
}

export type VerifyResult = { ok: true } | { ok: false; waitSeconds: number; attemptsLeft: number };

/** Checks a PIN with an increasing wait after repeated failures (30 s, 60 s, … up to 15 min). */
export async function verifyPin(pin: string, now = Date.now()): Promise<VerifyResult> {
  const fails = read<{ count: number; until: number }>(localStorage, FAIL_KEY) ?? { count: 0, until: 0 };
  if (now < fails.until) return { ok: false, waitSeconds: Math.ceil((fails.until - now) / 1000), attemptsLeft: 0 };
  const stored = read<StoredPin>(localStorage, PIN_KEY);
  if (!stored) return { ok: false, waitSeconds: 0, attemptsLeft: 0 };

  const given = await derive(pin, unb64(stored.salt), stored.iterations);
  const expected = unb64(stored.hash);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.min(given.length, expected.length); i++) diff |= given[i] ^ expected[i];
  if (diff === 0) {
    write(localStorage, FAIL_KEY, null);
    return { ok: true };
  }
  const count = fails.count + 1;
  const until = count >= FREE_ATTEMPTS ? now + Math.min(30_000 * 2 ** (count - FREE_ATTEMPTS), 15 * 60_000) : 0;
  write(localStorage, FAIL_KEY, { count, until });
  return { ok: false, waitSeconds: until ? Math.ceil((until - now) / 1000) : 0, attemptsLeft: Math.max(0, FREE_ATTEMPTS - count) };
}

/** Removes the PIN (used after proving identity with the server password). */
export function clearPin() {
  write(localStorage, PIN_KEY, null);
  write(localStorage, FAIL_KEY, null);
}

// ---- unlocked-for-this-session flag (closing the app/browser locks it again) ----
export const isSessionUnlocked = () => read<boolean>(sessionStorage, SESSION_KEY) === true;
export const setSessionUnlocked = (v: boolean) => write(sessionStorage, SESSION_KEY, v ? true : null);

// ---- patient-isolation lock (survives reloads, so a patient cannot escape by refreshing) ----
export type LockMode = 'patient' | null;
export const getLockMode = (): LockMode => (read<string>(localStorage, LOCK_KEY) === 'patient' ? 'patient' : null);
export const setLockMode = (m: LockMode) => write(localStorage, LOCK_KEY, m);
