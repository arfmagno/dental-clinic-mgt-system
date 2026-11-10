import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSync } from '../hooks/useSync';
import { ApiError } from '../services/api';
import { connectToServer } from '../services/session';

/** Turning sync on for the first time: prove this device belongs to the clinic (server password). */
export function Connect() {
  const nav = useNavigate();
  const { setOfflineMode } = useSync();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await connectToServer(password);
      setOfflineMode(false);
      nav(-1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 0
            ? 'Cannot reach the clinic server. Check the internet connection.'
            : err.status === 429
              ? `Too many attempts. Try again in ${Math.ceil((err.retryAfter ?? 60) / 60)} min.`
              : 'Incorrect clinic server password.'
          : 'Could not connect.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="stack narrow">
      <h1>Connect to clinic server</h1>
      <form className="card stack" onSubmit={submit}>
        <p className="muted">
          Sync backs up this device to the clinic server and shares records with other devices. The app keeps working offline either way.
        </p>
        <label className="field">
          <span>Clinic server password</span>
          <input type="password" autoFocus autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row form-actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect and turn on sync'}</button>
          <button type="button" className="btn" onClick={() => nav(-1)} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
