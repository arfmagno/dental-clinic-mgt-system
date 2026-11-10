import { Link } from 'react-router-dom';
import { formatDate, formatMoney } from '../domain/format';
import { usePatientSummaries, useRecentActivity } from '../hooks/useData';

const tiles = [
  { to: '/intake', icon: '➕', title: 'Add patient', hint: 'Opens the patient-facing form' },
  { to: '/procedures/new', icon: '🩺', title: 'Add procedure', hint: 'Record a treatment' },
  { to: '/patients?focus=1', icon: '🔎', title: 'Find patient', hint: 'Search records' },
  { to: '/records', icon: '📋', title: 'All records', hint: 'Every procedure, sortable' },
];

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
          <p className="muted">Nothing yet. Add your first patient to get started.</p>
        ) : (
          <ul className="activity">
            {activity.map((a) => (
              <li key={a.id}>
                <Link to={`/patients/${a.patientId}`}>
                  <span className={`badge ${a.action}`}>{a.action}</span>
                  <span className="grow">{a.kind === 'patient' ? 'Patient' : 'Procedure'}: <strong>{a.title}</strong></span>
                  <time className="muted small" dateTime={a.at}>{formatDate(a.at)} {new Date(a.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
