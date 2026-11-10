import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSync } from '../hooks/useSync';
import { disconnectFromServer } from '../services/session';

/**
 * Connection/sync state. Offline is the default; switching sync on asks to connect to the
 * clinic server the first time.
 */
export function SyncChip() {
  const s = useSync();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [open]);

  let tone = 'ok';
  let label = 'Synced';
  if (s.offlineMode) (tone = 'off'), (label = s.pending ? `Offline · ${s.pending} unsynced` : 'Offline');
  else if (!s.online) (tone = 'warn'), (label = 'No connection');
  else if (!s.hasToken) (tone = 'warn'), (label = 'Connect to sync');
  else if (s.status === 'syncing') (tone = 'busy'), (label = 'Syncing…');
  else if (s.status === 'error') (tone = 'bad'), (label = 'Sync problem');
  else if (s.pending > 0) (tone = 'busy'), (label = `${s.pending} to sync`);

  function toggleSync(on: boolean) {
    if (!on) return s.setOfflineMode(true);
    if (!s.hasToken) {
      setOpen(false);
      return nav('/connect');
    }
    s.setOfflineMode(false);
  }

  return (
    <div className="sync" ref={root}>
      <button className={`chip ${tone}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <span className="dot" aria-hidden /> {label}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Sync settings">
          <label className="switch">
            <input type="checkbox" checked={!s.offlineMode} onChange={(e) => toggleSync(e.target.checked)} />
            <span>Sync with clinic server</span>
          </label>
          <p className="muted small">
            Everything is saved on this device first. With sync on, changes are backed up to the clinic server and shared with other devices automatically.
          </p>
          <dl className="small">
            <dt>Connection</dt><dd>{s.online ? 'Online' : 'Offline'}</dd>
            <dt>Clinic server</dt><dd>{s.hasToken ? 'Connected' : 'Not connected'}</dd>
            <dt>Not yet synced</dt><dd>{s.pending} change{s.pending === 1 ? '' : 's'}</dd>
            <dt>Last synced</dt><dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}</dd>
          </dl>
          {s.lastError && !s.offlineMode && <p className="error small">{s.lastError}</p>}
          <div className="row">
            <button className="btn grow" disabled={!s.online || s.offlineMode || !s.hasToken || s.status === 'syncing'} onClick={() => void s.syncNow()}>
              Sync now
            </button>
            {s.hasToken && (
              <button className="btn ghost" onClick={() => (s.setOfflineMode(true), disconnectFromServer())}>Disconnect</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
