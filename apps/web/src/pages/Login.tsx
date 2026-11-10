import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../services/api';
import { login } from '../services/session';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(password);
      nav('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 0
            ? 'Cannot reach the server. First-time sign-in needs an internet connection.'
            : err.status === 429
              ? `Too many attempts. Try again in ${Math.ceil((err.retryAfter ?? 60) / 60)} min.`
              : 'Incorrect password.'
          : 'Sign-in failed.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="logo big" aria-hidden>🦷</div>
        <h1>Clinic sign-in</h1>
        <p className="muted">You only need to sign in once per device. After that the app works offline.</p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
