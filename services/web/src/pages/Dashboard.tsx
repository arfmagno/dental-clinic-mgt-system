import { useState } from 'react';
import { Link } from 'react-router-dom';
import { demoToolsEnabled, loadDemoData, removeDemoData } from '../services/demoService';
import { formatDate, formatMoney } from '../domain/format';
import { usePatientSummaries, useRecentActivity } from '../hooks/useData';

const tiles = [
  { to: '/patients/new', icon: '➕', title: 'Add patient', hint: 'Register a new patient' },
  { to: '/procedures/new', icon: '🩺', title: 'Add procedure', hint: 'Record a treatment' },
  { to: '/patients?focus=1', icon: '🔎', title: 'Find patient', hint: 'Search records' },
  { to: '/records', icon: '📋', title: 'All records', hint: 'Every procedure, sortable' },
];

const KIND_LABEL = { patient: 'Patient', procedure: 'Procedure', payment: 'Payment' } as const;

export function Dashboard() {
  const activity = useRecentActivity(8);
  const patients = usePatientSummaries();
  const owed = (patients ?? []).reduce((s, p) => s + Math.max(0, p.balanceCents), 0);

  return (
    <div className="stack">
      <h1>Welcome back</h1>
      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="tile">
            <span className="tile-icon" aria-hidden>{t.icon}</span>
            <strong>{t.title}</strong>
            <small className="muted">{t.hint}</small>
          </Link>
        ))}
      </div>

      <div className="stats">
        <div className="card stat"><small className="muted">Patients</small><strong>{patients?.length ?? '–'}</strong></div>
        <div className="card stat"><small className="muted">Outstanding balances</small><strong>{patients ? formatMoney(owed) : '–'}</strong></div>
      </div>

      <section className="card">
        <h2>Recent actions</h2>
        {activity === undefined ? (
          <p className="muted">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="muted">Nothing yet. <Link to="/patients/new">Add your first patient</Link> to get started.</p>
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack tight" aria-label="Sample data">
      <h2>Sample data</h2>
      <p className="muted small">For trying the app out: about 60 made-up patients with visits, payments and charts. Removing deletes only these sample records.</p>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => run(async () => `Loaded ${await loadDemoData()} sample patients.`)}>Load sample data</button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete all sample patients and their records?')) void run(async () => ((await removeDemoData()) ? 'Sample data removed.' : 'No sample data to remove.'));
          }}
        >
          Remove sample data
        </button>
      </div>
      {msg && <p role="status" className="small">{msg}</p>}
    </section>
  );
}
