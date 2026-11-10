import { api } from './api';

/**
 * Two separate facts:
 *  - "device ready": someone signed in on this device at least once, so the app may open
 *    (including offline). Local data is usable without a valid token.
 *  - token: only needed to sync. When it expires the app keeps working and asks to sign in again.
 */
const TOKEN = 'clinic.token';
const READY = 'clinic.deviceReady';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export const getToken = () => read(TOKEN);
export const isDeviceReady = () => read(READY) === '1';

export async function login(password: string): Promise<void> {
  const res = await api<{ token: string }>('/auth/login', { method: 'POST', body: { password } });
  write(TOKEN, res.token);
  write(READY, '1');
  window.dispatchEvent(new Event('clinic:session'));
}

/** Drops the sync token only; local records stay on the device. */
export function expireToken() {
  write(TOKEN, null);
  window.dispatchEvent(new Event('clinic:session'));
}

export function signOut() {
  write(TOKEN, null);
  write(READY, null);
  window.dispatchEvent(new Event('clinic:session'));
}
