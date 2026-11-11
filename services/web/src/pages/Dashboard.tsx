import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import { Icon, type IconName } from '../components/Icon';
import { demoToolsEnabled, loadDemoData, removeDemoData } from '../services/demoService';
import { formatDate } from '../domain/format';
import { useRecentActivity } from '../hooks/useData';

const tiles: { to: string; icon: IconName; title: string }[] = [
  { to: '/patients/new', icon: 'userPlus', title: 'Add Patient' },
  { to: '/records/new', icon: 'filePlus', title: 'Add Record' },
  { to: '/patients?focus=1', icon: 'search', title: 'Find Patient' },
  { to: '/transactions', icon: 'wallet', title: 'Transactions' },
];

const KIND_LABEL = { patient: 'Patient', procedure: 'Record', payment: 'Payment' } as const;

export function Dashboard() {
  const activity = useRecentActivity(8);

  return (
    <div className="stack">
      <h1>Dashboard</h1>
      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="tile">
            <span className="tile-icon"><Icon name={t.icon} size={22} /></span>
            <strong>{t.title}</strong>
          </Link>
        ))}
      </div>

      <section className="card">
        <h2>Recent actions</h2>
        {activity === undefined ? (
          <p className="muted">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="muted pad-y">Nothing yet. <Link to="/patients/new">Add your first patient</Link> to get started.</p>
        ) : (
          <ul className="activity">
            {activity.map((a) => (
              <li key={a.id}>
                <Link to={`/patients/${a.patientId}`}>
                  <span className={`badge ${a.action}`}>{a.action}</span>
                  <span className="grow">{KIND_LABEL[a.kind]}: <strong>{a.title}</strong></span>
                  <time className="muted small" dateTime={a.at}>{formatDate(a.at)} {new Date(a.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {demoToolsEnabled() && <DemoTools />}
    </div>
  );
}

function DemoTools() {
  const { notify, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      notify(await fn());
    } catch (e) {
      notify(`Failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack tight" aria-label="Sample data">
      <h2>Sample data</h2>
      <p className="muted small">For trying the app out: about 60 made-up patients with visits, payments and charts. Removing deletes only these sample records.</p>
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => run(async () => `Loaded ${await loadDemoData()} sample patients.`)}>Load</button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            const ok = await confirm({ title: 'Remove sample data?', message: 'All sample patients and their records will be deleted.', confirmLabel: 'Remove sample data', danger: true });
            if (ok) void run(async () => ((await removeDemoData()) ? 'Sample data removed.' : 'No sample data to remove.'));
          }}
        >
          Remove
        </button>
      </div>
    </section>
  );
}
