import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSync } from '../hooks/useSync';

/** Shows connection/sync state and lets staff switch between online (syncing) and offline-only work. */
export function SyncChip() {
  const s = useSync();
  const [open, setOpen] = useState(false);

  let tone = 'ok';
  let label = 'Synced';
  if (s.offlineMode) (tone = 'warn'), (label = 'Offline mode');
  else if (!s.online) (tone = 'warn'), (label = 'No connection');
  else if (s.status === 'auth') (tone = 'warn'), (label = 'Sign in to sync');
  else if (s.status === 'syncing') (tone = 'busy'), (label = 'Syncing…');
  else if (s.status === 'error') (tone = 'bad'), (label = 'Sync problem');
  else if (s.pending > 0) (tone = 'busy'), (label = `${s.pending} to sync`);

  return (
    <div className="sync">
      <button className={`chip ${tone}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <span className="dot" aria-hidden /> {label}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Sync settings">
          <label className="switch">
            <input type="checkbox" checked={s.offlineMode} onChange={(e) => s.setOfflineMode(e.target.checked)} />
            <span>Work offline only</span>
          </label>
          <p className="muted small">
            Everything is saved on this device first, so the app keeps working without internet. When online it syncs automatically.
          </p>
          <dl className="small">
            <dt>Connection</dt><dd>{s.online ? 'Online' : 'Offline'}</dd>
            <dt>Waiting to upload</dt><dd>{s.pending} change{s.pending === 1 ? '' : 's'}</dd>
            <dt>Last synced</dt><dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}</dd>
          </dl>
          {s.lastError && <p className="error small">{s.lastError}</p>}
          {s.status === 'auth' && <Link to="/login" className="btn primary block" onClick={() => setOpen(false)}>Sign in</Link>}
          <button className="btn block" disabled={!s.online || s.offlineMode || s.status === 'syncing'} onClick={() => void s.syncNow()}>
            Sync now
          </button>
        </div>
      )}
    </div>
  );
}
