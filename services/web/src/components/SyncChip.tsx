import { Link, useNavigate } from 'react-router-dom';
import { useSync } from '../hooks/useSync';
import { disconnectFromServer } from '../services/session';
import { Icon } from './Icon';
import { isDemo } from '../services/demo';

type ChipInput = Pick<ReturnType<typeof useSync>, 'offlineMode' | 'pending' | 'online' | 'hasToken' | 'status'>;

/** Colour tone and text of the chip, most important condition first. */
function chipState(s: ChipInput): [tone: string, label: string] {
  if (s.offlineMode) return ['off', 'Offline']; // how many changes wait is shown in Settings → Sync
  if (!s.online) return ['warn', 'No connection'];
  if (!s.hasToken) return ['warn', 'Connect to sync'];
  if (s.status === 'syncing') return ['busy', 'Syncing…'];
  if (s.status === 'error') return ['bad', 'Sync problem'];
  if (s.pending > 0) return ['busy', 'Waiting to sync'];
  return ['ok', 'Synced'];
}

/** Sync status in the top bar; opens the Sync section of Settings. */
export function SyncChip() {
  const [tone, label] = chipState(useSync());
  return (
    <div className="sync">
      <Link to="/settings?tab=sync" className={`chip ${tone}`} title="Sync settings">
        <span className="dot" aria-hidden /> <span className="chip-label">{label}</span>
      </Link>
    </div>
  );
}

/**
 * Sync settings. Offline is the default; switching sync on asks to connect to the clinic server
 * the first time.
 */
export function SyncSettings() {
  const s = useSync();
  const nav = useNavigate();

  function toggleSync(on: boolean) {
    if (!on) return s.setOfflineMode(true);
    if (!s.hasToken) return nav('/connect');
    s.setOfflineMode(false);
  }

  if (isDemo) return <p className="muted">The demo has no clinic server, so sync is off. In a clinic, devices sync through the server the clinic hosts.</p>;

  return (
    <div className="stack tight">
      <label className="switch">
        <input type="checkbox" checked={!s.offlineMode} onChange={(e) => toggleSync(e.target.checked)} />
        <span>Sync with clinic server</span>
      </label>
      <p className="muted small">
        Everything is saved on this device first. With sync on, changes are backed up to the clinic server and shared with other devices automatically.
      </p>
      <dl className="kv">
        <dt>Connection</dt><dd>{s.online ? 'Online' : 'Offline'}</dd>
        <dt>Clinic server</dt><dd>{s.hasToken ? 'Connected' : 'Not connected'}</dd>
        <dt>Not yet synced</dt><dd>{s.pending} change{s.pending === 1 ? '' : 's'}</dd>
        <dt>Last synced</dt><dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}</dd>
      </dl>
      {s.lastError && !s.offlineMode && <p className="error small">{s.lastError}</p>}
      <div className="actions">
        <button className="btn" disabled={!s.online || s.offlineMode || !s.hasToken || s.status === 'syncing'} onClick={() => void s.syncNow()}>
          <Icon name="refresh" size={17} /> {s.status === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
        {s.hasToken && (
          <button className="btn ghost" onClick={() => (s.setOfflineMode(true), disconnectFromServer())}>Disconnect</button>
        )}
      </div>
    </div>
  );
}
