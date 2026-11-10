import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSync } from '../hooks/useSync';
import { ApiError } from '../services/api';
import { bridgeErrorMessage, desktop } from '../services/desktop';
import { connectToServer } from '../services/session';

export function connectErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Could not connect.';
  if (err.status === 0 || err.status === 502) return 'Cannot reach the clinic server. Check the address and the internet connection.';
  if (err.status === 503) return 'The clinic server is not available right now.';
  if (err.status === 429) return `Too many attempts. Try again in ${Math.ceil((err.retryAfter ?? 60) / 60)} min.`;
  return 'Incorrect clinic server password.';
}

/** Turning sync on for the first time: prove this device belongs to the clinic (server password). */
export function Connect() {
  const nav = useNavigate();
  const { setOfflineMode } = useSync();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Desktop app: show the saved server address.
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
      setOfflineMode(false);
      nav(-1);
    } catch (err) {
      setError(connectErrorMessage(err));
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
        {desktop && (
          <label className="field">
            <span>Clinic server address</span>
            <input
              required
              inputMode="url"
              autoComplete="url"
              placeholder="e.g. 192.168.1.10:3001 or https://clinic.example.com"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span>Clinic server password</span>
          <input type="password" autoFocus={!desktop} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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
