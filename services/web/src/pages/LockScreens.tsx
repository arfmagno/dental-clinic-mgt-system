import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { PatientForm } from '../components/PatientForm';
import { PinForm } from '../components/PinForm';
import { ThemeToggle } from '../components/ThemeToggle';
import { useLock } from '../hooks/useLock';
import { rememberSyncOn } from '../hooks/useSync';
import { isDemo } from '../services/demo';
import { bridgeErrorMessage, desktop } from '../services/desktop';
import { emptyPatient, savePatient } from '../services/patientService';
import { PIN_PATTERN } from '../services/pinService';
import { connectToServer, getToken } from '../services/session';
import { activeStaff, canSignIn, SHARED_ACCOUNT_NAME } from '../services/staffService';
import { syncOnce } from '../services/syncEngine';
import { connectErrorMessage } from './Connect';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/**
 * First launch on this device, when nobody can sign in yet: choose the shared staff PIN (an
 * offline-only device needs nothing more), or join an existing clinic by downloading its records
 * and staff accounts from the server.
 */

export function Setup() {
  const [mode, setMode] = useState<'new' | 'join'>('new');
  return (
    <div className="center-screen">
      <div className="card login stack">
        <div className="logo big" aria-hidden>🦷</div>
        <h1>{mode === 'new' ? 'Create a staff PIN' : 'Join your clinic'}</h1>
        {mode === 'new' ? <CreateAdmin /> : <JoinClinic onCancel={() => setMode('new')} />}
        {mode === 'new' && isDemo && <p className="muted small">Demo: choose any PIN you will remember, such as 1234.</p>}
        {mode === 'new' && !isDemo && (
          <button type="button" className="link small" onClick={() => setMode('join')}>
            Already using the app on another device? Join your clinic
          </button>
        )}
      </div>
    </div>
  );
}

function CreateAdmin() {
  const { createAdmin } = useLock();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(pin)) return setError('Use 4 to 6 digits for the PIN.');
    if (pin !== confirm) return setError('The two PINs do not match.');
    setBusy(true);
    setError('');
    try {
      await createAdmin(SHARED_ACCOUNT_NAME, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">
        The PIN opens the app on this device and unlocks it after it has been handed to a patient. Everything works offline. Once the device syncs with a clinic server, each person can get their own account.
      </p>
      <label className="field">
        <span>New PIN (4–6 digits)</span>
        <input className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" autoFocus required value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </label>
      <label className="field">
        <span>Repeat PIN</span>
        <input className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Create PIN'}</button>
    </form>
  );
}

function JoinClinic({ onCancel }: { onCancel(): void }) {
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void desktop?.getServerUrl().then((url) => live && setAddress((a) => a || url));
    return () => {
      live = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (desktop) {
      try {
        setAddress(await desktop.setServerUrl(address));
      } catch (err) {
        setError(bridgeErrorMessage(err));
        setBusy(false);
        return;
      }
    }
    try {
      await connectToServer(password);
      rememberSyncOn();
      await syncOnce(getToken()!);
      // Once staff accounts arrive, the lock switches to the sign-in screen by itself.
      if (!(await activeStaff()).some(canSignIn)) {
        setError('Connected, but this clinic has no staff accounts yet. Go back and set it up instead.');
        setBusy(false);
      }
    } catch (err) {
      setError(connectErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">Download the clinic's records and staff accounts from the clinic server, then sign in with your own PIN. Needs internet once.</p>
      {desktop && (
        <label className="field">
          <span>Clinic server address</span>
          <input required inputMode="url" autoComplete="url" placeholder="e.g. 192.168.1.10:3001" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Clinic server password</span>
        <input type="password" autoFocus={!desktop} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={busy}>{busy ? 'Downloading…' : 'Join clinic'}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Back</button>
      </div>
    </form>
  );
}

/** App opened in a new session, or locked by staff. */
export function Unlock() {
  const { accounts } = useLock();
  return (
    <div className="center-screen">
      <div className="card login stack">
        <div className="logo big" aria-hidden>🦷</div>
        <h1>{accounts ? 'Who is signing in?' : 'Clinic is locked'}</h1>
        <PinForm submitLabel={accounts ? 'Sign in' : 'Unlock'} />
      </div>
    </div>
  );
}

/**
 * Isolated patient registration. Shown only after staff press "Hand to patient";
 * no navigation, records or balances are reachable until a staff PIN is entered.
 */
export function PatientMode() {
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0); // remounts (clears) the form
  const [staff, setStaff] = useState(false);
  const next = () => (setDone(false), setRound((r) => r + 1), window.scrollTo({ top: 0 }));

  return (
    <div className="intake">
      <div className="intake-top row between">
        <span className="brand"><span className="logo" aria-hidden>🦷</span> Patient registration</span>
        <ThemeToggle />
      </div>
      <div className="intake-card card">
        {done ? (
          <div className="stack center-text">
            <div className="logo big" aria-hidden>✅</div>
            <h1>Thank you!</h1>
            <p>Your details have been saved. Please hand the device back to the front desk.</p>
            <button className="btn primary" onClick={next}>Register another patient</button>
          </div>
        ) : (
          <>
            <h1>Welcome</h1>
            <p className="muted">Please fill in your details. Only your first and last name are required.</p>
            <PatientForm
              key={round}
              variant="patient"
              initial={emptyPatient()}
              initialContacts={[]}
              submitLabel="Register"
              savingLabel="Registering…"
              cancelLabel="Clear form"
              onCancel={next}
              onSubmit={async (fields, contacts) => {
                await savePatient(undefined, fields, contacts);
                setDone(true);
                window.scrollTo({ top: 0 });
              }}
            />
          </>
        )}
      </div>
      <p className="staff-exit">
        <button className="link" onClick={() => setStaff(true)}>🔒 Staff unlock</button>
      </p>
      {staff && (
        <Modal title="Staff unlock" onClose={() => setStaff(false)}>
          <PinForm submitLabel="Unlock" onCancel={() => setStaff(false)} />
        </Modal>
      )}
    </div>
  );
}
