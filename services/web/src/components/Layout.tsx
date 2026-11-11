import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { SyncChip } from './SyncChip';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/patients', label: 'Patients', icon: 'users', end: true },
  { to: '/patients/new', label: 'Add Patient', icon: 'userPlus' },
  { to: '/records/new', label: 'Add Record', icon: 'filePlus' },
  { to: '/records', label: 'Records', icon: 'list', end: true },
  { to: '/transactions', label: 'Transactions', icon: 'wallet' },
];
const byPath = (to: string) => NAV.find((n) => n.to === to)!;
const TABS_LEFT = [byPath('/'), byPath('/patients')];
const TABS_RIGHT = [byPath('/records'), byPath('/transactions')];
const ADD = [byPath('/patients/new'), byPath('/records/new')];

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

/**
 * Large screens: a top bar with every destination. Phones: a compact top bar plus a bottom tab bar
 * (Home, Patients, Add, Records, Transactions); "Add" opens a sheet with Add Patient / Add Record.
 */
export function Layout() {
  // The add sheet belongs to the page it was opened on, so any navigation closes it.
  const { pathname } = useLocation();
  const [addOpenOn, setAddOpenOn] = useState<string | null>(null);
  const addOpen = addOpenOn === pathname;
  const setAddOpen = (open: boolean) => setAddOpenOn(open ? pathname : null);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>🦷</span>
          <span className="brand-name">Magno Dental Clinic</span>
        </Link>
        <nav className="topnav" aria-label="Main">
          {NAV.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-tools">
          <SyncChip />
          <ThemeToggle />
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Tabs">
        {TABS_LEFT.map((l) => <Tab key={l.to} item={l} />)}
        <button type="button" className={`tab add ${addOpen ? 'open' : ''}`} aria-label="Add" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}>
          <span className="fab"><Icon name="plus" size={24} /></span>
        </button>
        {TABS_RIGHT.map((l) => <Tab key={l.to} item={l} />)}
      </nav>

      {addOpen && (
        <div className="sheet-backdrop" onClick={() => setAddOpen(false)}>
          <div className="sheet" role="menu" aria-label="Add" onClick={(e) => e.stopPropagation()}>
            {ADD.map((l) => (
              <Link key={l.to} to={l.to} role="menuitem" className="sheet-item" onClick={() => setAddOpen(false)}>
                <span className="sheet-icon"><Icon name={l.icon} /></span>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
      <span className="tab-icon"><Icon name={item.icon} /></span>
      <span className="tab-label">{item.label}</span>
    </NavLink>
  );
}
