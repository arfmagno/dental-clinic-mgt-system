import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { STAFF_ROLE_LABEL, STAFF_ROLES, type Staff, type StaffRole } from '@clinic/shared';
import type { Local } from '../data/db';
import { useLock } from '../hooks/useLock';
import { pinMatches, PIN_PATTERN } from '../services/pinService';
import { activeStaff, addStaff, canSignIn, deactivateStaff, setStaffPin, updateStaff } from '../services/staffService';
import { useFeedback } from './Feedback';
import { Icon } from './Icon';
import { Modal } from './Modal';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function PinFields({ pin, confirm, onPin, onConfirm, label = 'New PIN (4–6 digits)' }: { pin: string; confirm: string; onPin(v: string): void; onConfirm(v: string): void; label?: string }) {
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <input className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" required value={pin} onChange={(e) => onPin(digits(e.target.value))} />
      </label>
      <label className="field">
        <span>Repeat PIN</span>
        <input className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" required value={confirm} onChange={(e) => onConfirm(digits(e.target.value))} />
      </label>
    </>
  );
}

const pinProblem = (pin: string, confirm: string) =>
  !PIN_PATTERN.test(pin) ? 'Use 4 to 6 digits for the PIN.' : pin !== confirm ? 'The two PINs do not match.' : '';

/** Settings → Account: who is signed in, change my PIN, lock / switch user. */
export function AccountSection() {
  const { me, accounts, lockApp } = useLock();
  const { notify } = useFeedback();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function change(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    const problem = pinProblem(pin, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      if (!(await pinMatches(current, me))) throw new Error('Your current PIN is not correct.');
      await setStaffPin(me.id, pin);
      setCurrent('');
      setPin('');
      setConfirm('');
      notify('PIN changed');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      <div className="row between wrap">
        {accounts ? (
          <p>
            Signed in as <strong>{me.name}</strong> <span className="badge">{STAFF_ROLE_LABEL[me.role]}</span>
          </p>
        ) : (
          <p>This device uses one shared staff PIN.</p>
        )}
        <button type="button" className="btn" onClick={lockApp}><Icon name="lock" size={18} /> {accounts ? 'Lock / switch user' : 'Lock'}</button>
      </div>
      <p className="muted small">
        {accounts
          ? 'Everything you add or change is recorded in the activity log under your name.'
          : 'To give each person their own name and PIN (and see who did what in the activity log), connect this device to the clinic server under Sync.'}
      </p>
      <form className="stack tight" onSubmit={change}>
        <h3>{accounts ? 'Change my PIN' : 'Change the staff PIN'}</h3>
        <label className="field">
          <span>Current PIN</span>
          <input className="pin-input" type="password" inputMode="numeric" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
        </label>
        <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change PIN'}</button>
        </div>
      </form>
    </section>
  );
}

type Dialog = { kind: 'add' } | { kind: 'edit'; staff: Local<Staff> } | { kind: 'pin'; staff: Local<Staff> };

/** Settings → Staff (admins): add people, rename, change role, reset a PIN, deactivate. */
export function StaffSection() {
  const { me } = useLock();
  const { notify, confirm } = useFeedback();
  const staff = useLiveQuery(activeStaff, []);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  async function deactivate(s: Local<Staff>) {
    const ok = await confirm({
      title: `Deactivate ${s.name}?`,
      message: <>They can no longer sign in. What they did stays in the activity log under their name.</>,
      confirmLabel: 'Deactivate',
      danger: true,
    });
    if (!ok) return;
    try {
      await deactivateStaff(s.id);
      notify(`${s.name} deactivated`);
    } catch (err) {
      notify(message(err), 'error');
    }
  }

  return (
    <section className="card stack" aria-labelledby="staff-title">
      <div className="row between wrap">
        <h2 id="staff-title">Staff</h2>
        <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'add' })}><Icon name="userPlus" size={18} /> Add staff</button>
      </div>
      <p className="muted small">Each person signs in with their own PIN, on any device of the clinic (accounts sync). Admins can also manage staff, restore backups and delete patients.</p>
      <ul className="staff-list">
        {staff?.map((s) => (
          <li key={s.id} className="row between wrap">
            <span>
              <strong>{s.name}</strong>
              {s.id === me?.id && <span className="muted"> (you)</span>} <span className="badge">{STAFF_ROLE_LABEL[s.role]}</span>
              {!canSignIn(s) && <span className="muted small block">No PIN yet: set one so they can sign in.</span>}
            </span>
            <span className="row tight">
              <button type="button" className="btn ghost icon" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => setDialog({ kind: 'edit', staff: s })}><Icon name="edit" size={18} /></button>
              <button type="button" className="btn ghost icon" aria-label={`Reset PIN for ${s.name}`} title="Reset PIN" onClick={() => setDialog({ kind: 'pin', staff: s })}><Icon name="key" size={18} /></button>
              {s.id !== me?.id && (
                <button type="button" className="btn ghost icon danger" aria-label={`Deactivate ${s.name}`} title="Deactivate" onClick={() => void deactivate(s)}><Icon name="trash" size={18} /></button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {dialog?.kind === 'add' && (
        <Modal title="Add staff" onClose={close}>
          <StaffForm submitLabel="Add staff" withPin onDone={(name) => (close(), notify(`${name} added`))} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title={`Edit ${dialog.staff.name}`} onClose={close}>
          <StaffForm staff={dialog.staff} submitLabel="Save" onDone={() => (close(), notify('Account updated'))} />
        </Modal>
      )}
      {dialog?.kind === 'pin' && (
        <Modal title={`Reset PIN for ${dialog.staff.name}`} onClose={close}>
          <ResetPin staff={dialog.staff} onDone={() => (close(), notify(`New PIN set for ${dialog.staff.name}`))} />
        </Modal>
      )}
    </section>
  );
}

function StaffForm({ staff, withPin, submitLabel, onDone }: { staff?: Local<Staff>; withPin?: boolean; submitLabel: string; onDone(name: string): void }) {
  const [name, setName] = useState(staff?.name ?? '');
  const [role, setRole] = useState<StaffRole>(staff?.role ?? 'staff');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = withPin ? pinProblem(pin, confirm) : '';
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      if (staff) await updateStaff(staff.id, { name, role });
      else await addStaff({ name, role, pin });
      onDone(name.trim());
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input required autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
        </select>
      </label>
      {withPin && <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} label="Their PIN (4–6 digits)" />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

function ResetPin({ staff, onDone }: { staff: Local<Staff>; onDone(): void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = pinProblem(pin, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await setStaffPin(staff.id, pin);
      onDone();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">Tell {staff.name} the new PIN in person; they can change it under Settings → Account.</p>
      <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Set PIN'}</button>
      </div>
    </form>
  );
}
