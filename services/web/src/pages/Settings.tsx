import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ActivityLog } from '../components/Activity';
import { useFeedback } from '../components/Feedback';
import { Icon, type IconName } from '../components/Icon';
import { AccountSection, StaffSection } from '../components/StaffSettings';
import { SyncSettings } from '../components/SyncChip';
import { db } from '../data/db';
import { useLock } from '../hooks/useLock';
import {
  BackupError,
  decryptBackup,
  downloadBackup,
  lastBackupAt,
  PASSPHRASE_MIN,
  readBackupFile,
  restoreBackup,
  type Backup,
  type EncryptedBackup,
} from '../services/backupService';
import { setEnabled, useFeature } from '../services/features';
import { getTheme, setTheme, type Theme } from '../services/theme';

const TABS: { id: string; label: string; icon: IconName; admin?: boolean }[] = [
  { id: 'activity', label: 'Activity log', icon: 'activity' },
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'staff', label: 'Staff', icon: 'users', admin: true },
  { id: 'preferences', label: 'Preferences', icon: 'sliders' },
  { id: 'sync', label: 'Sync', icon: 'refresh' },
  { id: 'backup', label: 'Backup', icon: 'archive' },
];

export function Settings() {
  const [params] = useSearchParams();
  const { isAdmin, accounts } = useLock();
  const tabs = TABS.filter((t) => !t.admin || (isAdmin && accounts));
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'activity';

  return (
    <div className="stack">
      <h1>Settings</h1>
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings">
          {tabs.map((t) => (
            <Link key={t.id} to={`/settings?tab=${t.id}`} replace aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} size={18} /> {t.label}
            </Link>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'activity' && <ActivityLog />}
          {tab === 'account' && <AccountSection />}
          {tab === 'staff' && <StaffSection />}
          {tab === 'preferences' && <Preferences />}
          {tab === 'sync' && (
            <section className="card stack" aria-labelledby="sync-title">
              <h2 id="sync-title">Sync</h2>
              <SyncSettings />
            </section>
          )}
          {tab === 'backup' && <BackupSection />}
        </div>
      </div>
    </div>
  );
}

function Preferences() {
  const [theme, set] = useState<Theme>(getTheme);
  const choose = (next: Theme) => (setTheme(next), set(next));
  const reports = useFeature('reports');
  return (
    <section className="card stack" aria-labelledby="prefs-title">
      <h2 id="prefs-title">Preferences</h2>
      <label className="switch setting-row">
        <input type="checkbox" role="switch" checked={theme === 'dark'} onChange={(e) => choose(e.target.checked ? 'dark' : 'light')} aria-label="Dark mode" />
        <span>
          <strong>Dark mode</strong>
          <span className="muted small block">Easier on the eyes in a dim room. Remembered on this device.</span>
        </span>
      </label>
      <label className="switch setting-row">
        <input type="checkbox" role="switch" checked={reports} onChange={(e) => setEnabled('reports', e.target.checked)} aria-label="Show reports" />
        <span>
          <strong>Show reports</strong>
          <span className="muted small block">Collections, billing and unpaid balances on the dashboard and a Reports page. Off unless switched on, on this device.</span>
        </span>
      </label>
    </section>
  );
}

const TABLE_LABEL: Record<string, string> = {
  patients: 'Patients',
  patient_contacts: 'Contacts',
  procedures: 'Procedures',
  payments: 'Payments',
  dental_records: 'Chart records',
  tooth_entries: 'Tooth entries',
  staff: 'Staff accounts',
  audit_log: 'Activity entries',
};

function BackupSection() {
  const { notify } = useFeedback();
  const { isAdmin } = useLock();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(lastBackupAt);
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [unprotected, setUnprotected] = useState(false);
  const problem = unprotected
    ? ''
    : passphrase.length < PASSPHRASE_MIN
      ? `Use a passphrase of at least ${PASSPHRASE_MIN} characters.`
      : passphrase !== repeat
        ? 'The two passphrases do not match.'
        : '';
  const counts = useLiveQuery(async () => {
    const out: [string, number][] = [];
    for (const t of Object.keys(TABLE_LABEL)) out.push([t, await db.table(t).filter((r: { isDeleted: boolean }) => !r.isDeleted).count()]);
    return out;
  }, []);

  async function exportAll(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    try {
      const b = await downloadBackup(unprotected ? null : passphrase);
      setLast(b.exportedAt);
      setPassphrase('');
      setRepeat('');
      notify(`${unprotected ? 'Backup saved' : 'Encrypted backup saved'} · ${b.counts.patients} patient${b.counts.patients === 1 ? '' : 's'}`);
    } catch {
      notify('Could not create the backup', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup</h2>
      <p className="muted small">
        Saves every record on this device (patients with photos, contacts, procedures, payments, dental charts, staff accounts and the activity log) as one file you can keep on a USB drive or another computer. It works offline and does not need sync.
      </p>
      {counts && (
        <dl className="kv">
          {counts.map(([t, n]) => (
            <div key={t} className="contents"><dt>{TABLE_LABEL[t]}</dt><dd>{n}</dd></div>
          ))}
        </dl>
      )}
      <form className="stack tight" onSubmit={(e) => void exportAll(e)}>
        {!unprotected && (
          <div className="grid2">
            <label className="field">
              <span>Backup passphrase</span>
              <input type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </label>
            <label className="field">
              <span>Repeat passphrase</span>
              <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </label>
          </div>
        )}
        <p className="muted small">
          {unprotected
            ? 'The file will not be encrypted: anyone who gets it can read every patient record.'
            : 'The file is encrypted with this passphrase (AES-256). Without it the backup cannot be restored, so keep the passphrase somewhere safe, apart from the file.'}
        </p>
        <label className="switch small">
          <input type="checkbox" checked={unprotected} onChange={(e) => setUnprotected(e.target.checked)} />
          <span>Save without a passphrase (not recommended)</span>
        </label>
        {problem && (passphrase || repeat) && <p className="error small" role="alert">{problem}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || !!problem}>
            <Icon name="download" size={18} /> {busy ? 'Preparing…' : 'Export all data'}
          </button>
        </div>
      </form>
      <p className="muted small">
        {last ? <>Last backup from this device: {new Date(last).toLocaleString()}.</> : 'No backup has been made from this device yet.'}{' '}
        Store backups somewhere only clinic staff can reach.
      </p>
      {isAdmin ? <RestoreSection /> : <p className="muted small">Restoring a backup is done by an admin.</p>}
    </section>
  );
}

function RestoreSection() {
  const { notify, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState<EncryptedBackup | null>(null);
  const [passphrase, setPassphrase] = useState('');

  async function restoreFrom(file: File) {
    setError('');
    setLocked(null);
    setBusy(true);
    try {
      const opened = await readBackupFile(file);
      if (opened.locked) {
        setPassphrase('');
        setLocked(opened.envelope);
        return;
      }
      await confirmAndRestore(opened.backup);
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'Could not restore the backup.');
    } finally {
      setBusy(false);
    }
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!locked) return;
    setError('');
    setBusy(true);
    try {
      const backup = await decryptBackup(locked, passphrase);
      setLocked(null);
      setPassphrase('');
      await confirmAndRestore(backup);
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Could not restore the backup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndRestore(backup: Backup) {
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : 'an unknown date';
    const ok = await confirm({
      title: 'Restore this backup?',
      message: (
        <>
          The backup from <strong>{when}</strong> has {backup.counts.patients} patient{backup.counts.patients === 1 ? '' : 's'}, {backup.counts.procedures} procedure
          {backup.counts.procedures === 1 ? '' : 's'} and {backup.counts.payments} payment{backup.counts.payments === 1 ? '' : 's'}. Records missing here are added and
          older copies are brought up to date. Anything changed on this device after the backup is kept.
        </>
      ),
      confirmLabel: 'Restore backup',
    });
    if (!ok) return;
    const r = await restoreBackup(backup);
    notify(r.added + r.updated === 0 ? 'Nothing to restore: this device is already up to date' : `Backup restored · ${r.added} added, ${r.updated} updated`);
  }

  return (
    <div className="stack tight restore">
      <h3>Restore from a backup</h3>
      <p className="muted small">
        Choose a backup file made with <em>Export all data</em>, for example on a new or reset computer. Nothing is deleted: records missing here are added, and a record is only replaced by a newer copy from the backup.
      </p>
      <label className={`btn file-btn${busy ? ' disabled' : ''}`}>
        <Icon name="upload" size={18} /> {busy ? 'Reading…' : 'Choose backup file'}
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Choose backup file"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // the same file can be chosen again
            if (file) void restoreFrom(file);
          }}
        />
      </label>
      {locked && (
        <form className="stack tight" onSubmit={(e) => void unlock(e)}>
          <p className="small">
            This backup{locked.exportedAt && <> from <strong>{new Date(locked.exportedAt).toLocaleString()}</strong></>} is encrypted. Enter its passphrase.
          </p>
          <label className="field">
            <span>Passphrase for this backup</span>
            <input type="password" autoComplete="off" autoFocus required value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
          <div className="row form-actions">
            <button className="btn primary" disabled={busy || !passphrase}>{busy ? 'Opening…' : 'Open backup'}</button>
            <button type="button" className="btn" onClick={() => (setLocked(null), setError(''))} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
