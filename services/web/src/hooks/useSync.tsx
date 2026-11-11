import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { ApiError } from '../services/api';
import { disconnectFromServer, getStaffToken, getToken, setStaffToken, syncToken } from '../services/session';
import { pendingCount, syncOnce } from '../services/syncEngine';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'auth';

interface SyncState {
  online: boolean;
  /** True when this device has a server session (needed to sync). */
  hasToken: boolean;
  /** User switch: stay fully offline even when a connection exists. Default true. */
  offlineMode: boolean;
  setOfflineMode(v: boolean): void;
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  syncNow(): Promise<void>;
}

const Ctx = createContext<SyncState | null>(null);
export const useSync = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync outside SyncProvider');
  return v;
};

const OFFLINE_KEY = 'clinic.offlineMode';
/** Turns sync on for when the provider mounts: used when a new device joins a clinic during setup. */
export function rememberSyncOn() {
  try {
    localStorage.setItem(OFFLINE_KEY, '0');
  } catch {
    /* ignore */
  }
}
const LAST_SYNC_KEY = 'lastSyncAt';
const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  // Offline is the default: nothing leaves the device until staff switch sync on.
  const [offlineMode, setOfflineModeState] = useState(safeGet(OFFLINE_KEY) !== '0');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(!!getToken());
  const lastSync = useLiveQuery(async () => ((await db.meta.get(LAST_SYNC_KEY))?.value as string | undefined) ?? null, []);
  const pending = useLiveQuery(() => pendingCount(), []) ?? 0;
  const running = useRef(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const session = () => setHasToken(!!getToken());
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('clinic:session', session);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('clinic:session', session);
    };
  }, []);

  const setOfflineMode = useCallback((v: boolean) => {
    setOfflineModeState(v);
    try {
      localStorage.setItem(OFFLINE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const syncNow = useCallback(async () => {
    const token = syncToken();
    if (running.current) return;
    if (!token) return void setStatus('auth');
    running.current = true;
    setStatus('syncing');
    try {
      const outcome = await syncOnce(token);
      await db.meta.put({ key: LAST_SYNC_KEY, value: new Date().toISOString() });
      // Rows the server refused stay on this device (and are retried); say why.
      setLastError(outcome.problems[0] ?? null);
      setStatus('idle');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && getStaffToken()) {
        setStaffToken(null); // the staff session expired: carry on as the device
        setStatus('idle');
      } else if (err instanceof ApiError && err.status === 401) {
        disconnectFromServer(); // keep working locally; ask to connect again
        setStatus('auth');
      } else {
        setLastError(err instanceof ApiError && err.status === 0 ? 'Server unreachable' : err instanceof Error ? err.message : 'Sync failed');
        setStatus('error');
      }
    } finally {
      running.current = false;
    }
  }, []);

  const enabled = online && !offlineMode && hasToken;

  // Sync on start / reconnect / switching back online, and every 30 s while enabled.
  useEffect(() => {
    if (!enabled) return;
    // Syncing is the external system this effect exists for; its status updates are intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void syncNow();
    const t = setInterval(() => void syncNow(), 30_000);
    return () => clearInterval(t);
  }, [enabled, syncNow]);

  // Push soon after local edits.
  useEffect(() => {
    if (!enabled || pending === 0) return;
    const t = setTimeout(() => void syncNow(), 1500);
    return () => clearTimeout(t);
  }, [enabled, pending, syncNow]);

  const value = useMemo<SyncState>(
    () => ({ online, offlineMode, setOfflineMode, status: !hasToken && status !== 'syncing' ? 'auth' : status, hasToken, pending, lastSyncAt: lastSync ?? null, lastError, syncNow }),
    [online, offlineMode, setOfflineMode, status, hasToken, pending, lastSync, lastError, syncNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
