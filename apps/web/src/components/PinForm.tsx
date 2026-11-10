import { useEffect, useState, type FormEvent } from 'react';
import { useLock } from '../hooks/useLock';
import { ApiError } from '../services/api';

interface Props {
  submitLabel: string;
  onCancel?(): void;
  onUnlocked?(): void;
}

/** PIN entry with back-off messaging and a server-password "forgot PIN" path. */
export function PinForm({ submitLabel, onCancel, onUnlocked }: Props) {
  const { unlock, resetWithServerPassword } = useLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await unlock(pin);
    setBusy(false);
    if (res.ok) return onUnlocked?.();
    setPin('');
    if (res.waitSeconds) {
      setWait(res.waitSeconds);
      setError('Too many wrong attempts.');
    } else setError(res.attemptsLeft ? `Wrong PIN. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} before a short wait.` : 'Wrong PIN.');
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await resetWithServerPassword(password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? 'Needs an internet connection to the clinic server.' : err instanceof ApiError && err.status === 429 ? 'Too many attempts. Try again later.' : 'That is not the clinic server password.');
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <form className="stack" onSubmit={reset}>
        <p className="muted small">Enter the clinic <strong>server</strong> password to set a new PIN. This needs internet. Your records on this device are kept.</p>
        <label className="field">
          <span>Clinic server password</span>
          <input type="password" autoFocus autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row form-actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Checking…' : 'Reset PIN'}</button>
          <button type="button" className="btn" onClick={() => (setForgot(false), setError(''))}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Staff PIN</span>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4,6}"
          maxLength={6}
          autoFocus
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          disabled={wait > 0}
        />
      </label>
      {error && <p className="error" role="alert">{error}{wait > 0 && ` Try again in ${wait}s.`}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={busy || wait > 0 || pin.length < 4}>{busy ? 'Checking…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
      <button type="button" className="link small" onClick={() => (setForgot(true), setError(''))}>Forgot PIN?</button>
    </form>
  );
}
