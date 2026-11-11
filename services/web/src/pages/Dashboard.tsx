import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RecentActivity } from '../components/Activity';
import { Icon, type IconName } from '../components/Icon';
import { formatMoney } from '../domain/format';
import { usePatientSummaries } from '../hooks/useData';
import { useFeature } from '../services/features';
import { ReportSummary } from './Reports';

interface Tile {
  to: string;
  icon: IconName;
  title: string;
  hint: string;
  primary?: boolean;
}

/** Greeting and long date, fixed when the dashboard opens. */
function heading() {
  const now = new Date();
  const h = now.getHours();
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${hello} · ${now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
}

export function Dashboard() {
  const owing = usePatientSummaries()?.filter((s) => s.balanceCents > 0);
  const owed = owing?.reduce((s, p) => s + p.balanceCents, 0) ?? 0;
  const [eyebrow] = useState(heading);
  const reports = useFeature('reports');

  const tiles: Tile[] = [
    { to: '/patients/new', icon: 'userPlus', title: 'Add Patient', hint: 'Register a new patient', primary: true },
    { to: '/records/new', icon: 'filePlus', title: 'Add Record', hint: 'Procedure, chart and payment', primary: true },
    { to: '/patients?focus=1', icon: 'search', title: 'Find Patient', hint: 'Search by name or contact' },
    { to: '/transactions', icon: 'wallet', title: 'Transactions', hint: 'Payments by patient' },
    {
      to: '/transactions?view=owing',
      icon: 'coins',
      title: 'Settle Balances',
      hint: owing === undefined ? 'Collect what is owed' : owing.length === 0 ? 'Nothing outstanding' : `${owing.length} ${owing.length === 1 ? 'patient owes' : 'patients owe'} ${formatMoney(owed)}`,
    },
  ];

  return (
    <div className="stack">
      <header className="dash-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>Dashboard</h1>
      </header>
      <nav className="tiles" aria-label="Actions">
        {tiles.map((t) => (
          <Link key={t.title} to={t.to} className={`tile${t.primary ? ' primary' : ''}`}>
            <span className="tile-icon"><Icon name={t.icon} size={24} /></span>
            <span className="tile-text">
              <strong>{t.title}</strong>
              <span className="tile-hint">{t.hint}</span>
            </span>
          </Link>
        ))}
      </nav>
      {reports && <ReportSummary />}
      <RecentActivity limit={8} />
    </div>
  );
}

