import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useLock } from '../hooks/useLock';
import { SyncChip } from './SyncChip';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/patients', label: 'Patients', end: true },
  { to: '/patients/new', label: 'Add patient' },
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
        <div className="topbar-tools">
          <ThemeToggle />
          <SyncChip />
          <LockMenu />
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

/** The only way into the isolated patient view (and to lock the app when stepping away). */
function LockMenu() {
  const { lockForPatient, lockApp } = useLock();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="sync" ref={root}>
      <button className="btn lock-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title="Lock">
        <span aria-hidden>🔒</span> Lock
      </button>
      {open && (
        <div className="popover menu" role="menu">
          <button role="menuitem" className="menu-item" onClick={lockForPatient}>
            <strong>Hand to patient</strong>
            <small className="muted">Shows only the registration form. Staff PIN to leave.</small>
          </button>
          <button role="menuitem" className="menu-item" onClick={lockApp}>
            <strong>Lock app</strong>
            <small className="muted">Hide everything until the staff PIN is entered.</small>
          </button>
        </div>
      )}
    </div>
  );
}
