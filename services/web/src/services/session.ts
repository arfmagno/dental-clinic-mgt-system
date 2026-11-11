import { api } from './api';

/**
 * Server session for SYNC ONLY. The app itself opens with the local staff PIN (pinService) and
 * works offline without ever contacting the server. A token is obtained when staff switch sync on.
 */
const TOKEN = 'clinic.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
}

function setToken(v: string | null) {
  try {
    if (v === null) localStorage.removeItem(TOKEN);
    else localStorage.setItem(TOKEN, v);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('clinic:session'));
}

/** Signs in to the clinic server (needs internet). */
export async function connectToServer(password: string): Promise<void> {
  const res = await api<{ token: string }>('/auth/login', { method: 'POST', body: { password } });
  setToken(res.token);
}

/** Drops the sync token (expired or user disconnected). Local records stay on the device. */
export function disconnectFromServer() {
  setStaffToken(null);
  setToken(null);
}

// ---- staff session on the server (accounts mode) ----
// The clinic token proves the device belongs to the clinic. A staff token proves who is using it:
// requested at sign-in with the person's PIN while online, kept for this browser session only.
// Changes to staff accounts are accepted by the server only with an admin's staff token.
const STAFF_TOKEN = 'clinic.staffToken';

export function getStaffToken(): string | null {
  try {
    return sessionStorage.getItem(STAFF_TOKEN);
  } catch {
    return null;
  }
}

export function setStaffToken(v: string | null) {
  try {
    if (v === null) sessionStorage.removeItem(STAFF_TOKEN);
    else sessionStorage.setItem(STAFF_TOKEN, v);
  } catch {
    /* storage unavailable */
  }
}

/** Best effort: offline, or a PIN changed elsewhere and not synced yet, simply leaves no staff token. */
export async function signInStaffOnline(staffId: string, pin: string): Promise<boolean> {
  const device = getToken();
  setStaffToken(null);
  if (!device) return false;
  try {
    const res = await api<{ token: string }>('/auth/staff', { method: 'POST', body: { staffId, pin }, token: device });
    setStaffToken(res.token);
    return true;
  } catch {
    return false;
  }
}

/** The token sync uses: the signed-in person's when there is one, else the device's. */
export const syncToken = (): string | null => getStaffToken() ?? getToken();
