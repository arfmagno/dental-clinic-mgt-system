import { useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { PatientForm } from '../components/PatientForm';
import { PinForm } from '../components/PinForm';
import { ThemeToggle } from '../components/ThemeToggle';
import { useLock } from '../hooks/useLock';
import { emptyPatient, savePatient } from '../services/patientService';
import { PIN_PATTERN } from '../services/pinService';

/** First launch on this device: staff choose the PIN that opens the app and leaves patient mode. */
export function SetupPin() {
  const { createPin } = useLock();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(pin)) return setError('Use 4 to 6 digits.');
    if (pin !== confirm) return setError('The two PINs do not match.');
    setBusy(true);
    await createPin(pin);
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  return (
    <div className="center-screen">
      <form className="card login stack" onSubmit={submit}>
        <div className="logo big" aria-hidden>🦷</div>
        <h1>Create a staff PIN</h1>
        <p className="muted">
          The PIN opens the app on this device and unlocks it after it has been handed to a patient. Everything works offline.
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
    </div>
  );
}

/** App opened in a new session, or locked by staff. */
export function Unlock() {
  return (
    <div className="center-screen">
      <div className="card login stack">
        <div className="logo big" aria-hidden>🦷</div>
        <h1>Clinic is locked</h1>
        <PinForm submitLabel="Unlock" />
      </div>
    </div>
  );
}

/**
 * Isolated patient registration. Shown only after staff press Lock → "Hand to patient";
 * no navigation, records or balances are reachable until the staff PIN is entered.
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
