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
  setToken(null);
}
