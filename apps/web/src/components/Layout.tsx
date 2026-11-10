import { NavLink, Outlet } from 'react-router-dom';
import { SyncChip } from './SyncChip';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/patients', label: 'Patients' },
  { to: '/procedures/new', label: 'Add procedure' },
  { to: '/records', label: 'Records' },
];

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          <span className="logo" aria-hidden>🦷</span> Clinic
        </NavLink>
        <nav aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <SyncChip />
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
