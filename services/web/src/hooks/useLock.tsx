import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Staff } from '@clinic/shared';
import { PATIENT_ACTOR, setActor } from '../data/actor';
import type { Local } from '../data/db';
import { connectToServer, getToken, setStaffToken, signInStaffOnline } from '../services/session';
import { getLockMode, sessionStaffId, setLastStaffId, setLockMode, setSessionStaffId, verifyStaffPin, type VerifyResult } from '../services/pinService';
import { activeStaff, canSignIn, createFirstAdmin, recoverPin } from '../services/staffService';

/**
 *  loading – reading the staff accounts
 *  setup   – nobody can sign in on this device yet: create the first admin, or join a clinic
 *  locked  – app opened (new session) or locked: pick your name, enter your PIN
 *  patient – handed to a patient: only the registration form is shown; a staff PIN to leave
 *  open    – normal staff use, as `me`
 */
export type LockStage = 'loading' | 'setup' | 'locked' | 'patient' | 'open';

interface LockState {
  stage: LockStage;
  /** Accounts on this device (active ones), admins first. */
  staff: Local<Staff>[];
  /** The signed-in staff member (also during patient mode: whoever handed the device over). */
  me: Local<Staff> | null;
  isAdmin: boolean;
  /**
   * Per-person accounts (pick your name, own PIN, "by" in the activity log) are used on devices that
   * sync with the clinic server, or that already have several accounts. An offline-only device keeps
   * one shared staff PIN.
   */
  accounts: boolean;
  createAdmin(name: string, pin: string): Promise<void>;
  signIn(staffId: string, pin: string): Promise<VerifyResult>;
  lockForPatient(): void;
  lockApp(): void;
  /** Forgot PIN: prove the device belongs to the clinic with the server password (online), then set a new PIN. */
  recoverWithServerPassword(password: string, staffId: string, pin: string): Promise<void>;
}

const Ctx = createContext<LockState | null>(null);
export const useLock = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLock outside LockProvider');
  return v;
};

export function LockProvider({ children }: { children: ReactNode }) {
  const staff = useLiveQuery(activeStaff, []);
  const [sessionId, setSessionId] = useState<string | null>(sessionStaffId);
  const [patientMode, setPatientMode] = useState(getLockMode() === 'patient');
  const [hasToken, setHasToken] = useState(() => !!getToken());
  useEffect(() => {
    const onSession = () => setHasToken(!!getToken());
    window.addEventListener('clinic:session', onSession);
    return () => window.removeEventListener('clinic:session', onSession);
  }, []);
  const accounts = hasToken || (staff?.filter(canSignIn).length ?? 0) > 1;

  const me = useMemo(() => staff?.find((s) => s.id === sessionId && canSignIn(s)) ?? null, [staff, sessionId]);
  const stage: LockStage =
    staff === undefined ? 'loading' : !staff.some(canSignIn) ? 'setup' : patientMode ? 'patient' : me ? 'open' : 'locked';

  // Every write is audited with whoever is acting right now.
  useEffect(() => {
    setActor(stage === 'patient' ? PATIENT_ACTOR : stage === 'open' && me ? me.id : null);
  }, [stage, me]);

  const open = useCallback((id: string) => {
    setSessionStaffId(id);
    setLastStaffId(id);
    setSessionId(id);
    setLockMode(null);
    setPatientMode(false);
  }, []);

  const createAdmin = useCallback(
    async (name: string, pin: string) => {
      const id = await createFirstAdmin(name, pin);
      open(id);
      void signInStaffOnline(id, pin);
    },
    [open],
  );

  const signIn = useCallback(
    async (staffId: string, pin: string) => {
      const s = staff?.find((x) => x.id === staffId);
      if (!s || !canSignIn(s)) return { ok: false, waitSeconds: 0, attemptsLeft: 0 } as const;
      const res = await verifyStaffPin(staffId, pin, s);
      if (res.ok) {
        open(staffId);
        // also sign in on the clinic server when connected (needed there for staff-account changes)
        void signInStaffOnline(staffId, pin);
      }
      return res;
    },
    [staff, open],
  );

  const lockForPatient = useCallback(() => {
    setLockMode('patient');
    setPatientMode(true);
  }, []);

  const lockApp = useCallback(() => {
    setStaffToken(null);
    setSessionStaffId(null);
    setSessionId(null);
  }, []);

  const recoverWithServerPassword = useCallback(
    async (password: string, staffId: string, pin: string) => {
      await connectToServer(password); // throws on wrong password / offline
      await recoverPin(staffId, pin);
      open(staffId);
    },
    [open],
  );

  const value = useMemo<LockState>(
    () => ({ stage, staff: staff ?? [], me, isAdmin: me?.role === 'admin', accounts, createAdmin, signIn, lockForPatient, lockApp, recoverWithServerPassword }),
    [stage, staff, me, accounts, createAdmin, signIn, lockForPatient, lockApp, recoverWithServerPassword],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
