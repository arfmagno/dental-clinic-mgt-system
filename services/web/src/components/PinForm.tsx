import { useEffect, useState, type FormEvent } from 'react';
import { STAFF_ROLE_LABEL } from '@clinic/shared';
import { useLock } from '../hooks/useLock';
import { ApiError } from '../services/api';
import { lastStaffId, PIN_PATTERN } from '../services/pinService';
import { canSignIn } from '../services/staffService';

interface Props {
  submitLabel: string;
  onCancel?(): void;
  onUnlocked?(): void;
}

const initials = (name: string) =>
  name
    .replace(/^(Dr|Dra|Mr|Ms|Mrs)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/**
 * Sign in as a staff member: pick your name, enter your PIN. On an offline-only device (one shared
 * account) it is just the PIN. Back-off messaging and a "forgot PIN" path.
 */
export function PinForm({ submitLabel, onCancel, onUnlocked }: Props) {
  const { staff, accounts, signIn, recoverWithServerPassword } = useLock();
  const people = staff.filter(canSignIn);
  const [picked, setWho] = useState(() => {
    const last = lastStaffId();
    return people.find((p) => p.id === last)?.id ?? (people.length === 1 ? people[0].id : '');
  });
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const who = accounts ? picked : (people[0]?.id ?? '');
  const person = accounts ? people.find((p) => p.id === who) : undefined;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!who) return setError('Choose your name first.');
    setBusy(true);
    setError('');
    const res = await signIn(who, pin);
    setBusy(false);
    if (res.ok) return onUnlocked?.();
    setPin('');
    if (res.waitSeconds) {
      setWait(res.waitSeconds);
      setError('Too many wrong attempts.');
    } else setError(res.attemptsLeft ? `Wrong PIN. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} before a short wait.` : 'Wrong PIN.');
  }

  async function recover(e: FormEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(newPin)) return setError('Use 4 to 6 digits for the new PIN.');
    setBusy(true);
    setError('');
    try {
      await recoverWithServerPassword(password, who, newPin);
      onUnlocked?.();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? 'Needs an internet connection to the clinic server.' : err instanceof ApiError && err.status === 429 ? 'Too many attempts. Try again later.' : 'That is not the clinic server password.');
      setBusy(false);
    }
  }

  const picker = accounts && (
    <div className="staff-picker" role="radiogroup" aria-label="Who is signing in?">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={who === p.id}
          className={`staff-option${who === p.id ? ' on' : ''}`}
          onClick={() => (setWho(p.id), setError(''), setPin(''))}
        >
          <span className="staff-initials" aria-hidden>{initials(p.name)}</span>
          <span className="staff-name">{p.name}<span className="muted small block">{STAFF_ROLE_LABEL[p.role]}</span></span>
        </button>
      ))}
    </div>
  );

  // With per-person accounts the server only accepts PIN changes from an admin, so a forgotten PIN
  // is reset by an admin (the server password proves the device, not the person).
  if (forgot && accounts) {
    return (
      <div className="stack">
        <p>Ask an admin to set a new PIN for you under <strong>Settings → Staff</strong>. You can change it afterwards under Settings → Account.</p>
        <p className="muted small">If no admin can sign in, whoever runs the clinic server can reset an admin&apos;s PIN there (see the hosting guide).</p>
        <div className="row form-actions">
          <button type="button" className="btn" onClick={() => setForgot(false)}>Back</button>
        </div>
      </div>
    );
  }

  if (forgot) {
    return (
      <form className="stack" onSubmit={recover}>
        <p className="muted small">{accounts ? 'Choose your name, then enter' : 'Enter'} the clinic <strong>server</strong> password and a new PIN. This needs internet. Records on this device are kept.</p>
        {picker}
        <label className="field">
          <span>Clinic server password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>New PIN (4–6 digits)</span>
          <input className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" required value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row form-actions">
          <button className="btn primary" disabled={busy || !who}>{busy ? 'Checking…' : 'Set new PIN'}</button>
          <button type="button" className="btn" onClick={() => (setForgot(false), setError(''))}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      {picker}
      <label className="field">
        <span>{person ? `PIN for ${person.name}` : 'PIN'}</span>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Staff PIN"
          pattern="\d{4,6}"
          maxLength={6}
          autoFocus
          required
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
          disabled={wait > 0}
        />
      </label>
      {error && <p className="error" role="alert">{error}{wait > 0 && ` Try again in ${wait}s.`}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={busy || wait > 0 || pin.length < 4 || !who}>{busy ? 'Checking…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
      <button type="button" className="link small" onClick={() => (setForgot(true), setError(''))}>Forgot PIN?</button>
    </form>
  );
}
