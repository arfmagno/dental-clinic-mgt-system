import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { connectToServer } from '../services/session';
import {
  clearPin,
  getLockMode,
  hasPin,
  isSessionUnlocked,
  setLockMode,
  setPin,
  setSessionUnlocked,
  verifyPin,
  type VerifyResult,
} from '../services/pinService';

/**
 *  setup   – no PIN on this device yet: create one
 *  locked  – app opened (new session): enter PIN
 *  patient – handed to a patient: only the registration form is shown; PIN to leave
 *  open    – normal staff use
 */
export type LockStage = 'setup' | 'locked' | 'patient' | 'open';

interface LockState {
  stage: LockStage;
  createPin(pin: string): Promise<void>;
  unlock(pin: string): Promise<VerifyResult>;
  lockForPatient(): void;
  lockApp(): void;
  /** Forgot PIN: prove identity with the clinic server password (online), then set a new PIN. */
  resetWithServerPassword(password: string): Promise<void>;
}

const Ctx = createContext<LockState | null>(null);
export const useLock = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLock outside LockProvider');
  return v;
};

const current = (): LockStage => (!hasPin() ? 'setup' : getLockMode() === 'patient' ? 'patient' : isSessionUnlocked() ? 'open' : 'locked');

export function LockProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<LockStage>(current);

  const createPin = useCallback(async (pin: string) => {
    await setPin(pin);
    setLockMode(null);
    setSessionUnlocked(true);
    setStage('open');
  }, []);

  const unlock = useCallback(async (pin: string) => {
    const res = await verifyPin(pin);
    if (res.ok) {
      setLockMode(null);
      setSessionUnlocked(true);
      setStage('open');
    }
    return res;
  }, []);

  const lockForPatient = useCallback(() => {
    setLockMode('patient');
    setStage('patient');
  }, []);

  const lockApp = useCallback(() => {
    setSessionUnlocked(false);
    setStage('locked');
  }, []);

  const resetWithServerPassword = useCallback(async (password: string) => {
    await connectToServer(password); // throws on wrong password / offline
    clearPin();
    setLockMode(null);
    setSessionUnlocked(false);
    setStage('setup');
  }, []);

  const value = useMemo(() => ({ stage, createPin, unlock, lockForPatient, lockApp, resetWithServerPassword }), [stage, createPin, unlock, lockForPatient, lockApp, resetWithServerPassword]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
