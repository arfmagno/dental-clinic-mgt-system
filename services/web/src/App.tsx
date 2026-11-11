import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FeedbackProvider } from './components/Feedback';
import { DemoBanner } from './components/DemoBanner';
import { Layout } from './components/Layout';
import { LockProvider, useLock } from './hooks/useLock';
import { SyncProvider } from './hooks/useSync';
import { Dashboard } from './pages/Dashboard';
import { PatientMode, Setup, Unlock } from './pages/LockScreens';
import { isDemo } from './services/demo';

// Pages other than the dashboard load on first visit (smaller start-up download). The service
// worker still precaches every chunk, so they all work offline.
const AddProcedure = lazy(() => import('./pages/AddProcedure').then((m) => ({ default: m.AddProcedure })));
const Connect = lazy(() => import('./pages/Connect').then((m) => ({ default: m.Connect })));
const PatientDetail = lazy(() => import('./pages/PatientDetail').then((m) => ({ default: m.PatientDetail })));
const PatientNew = lazy(() => import('./pages/PatientNew').then((m) => ({ default: m.PatientNew })));
const Patients = lazy(() => import('./pages/Patients').then((m) => ({ default: m.Patients })));
const Records = lazy(() => import('./pages/Records').then((m) => ({ default: m.Records })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Transactions = lazy(() => import('./pages/Transactions').then((m) => ({ default: m.Transactions })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

export function App() {
  return (
    <LockProvider>
      <FeedbackProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          {isDemo && <DemoBanner />}
          <Gate />
        </BrowserRouter>
      </FeedbackProvider>
    </LockProvider>
  );
}

/**
 * The staff PIN gates everything. Patient mode (isolated registration) is entered from the
 * Add Patient page ("Hand to patient"); sync keeps running in the background in every stage.
 */
function Gate() {
  const { stage } = useLock();
  if (stage === 'loading') return null;
  if (stage === 'setup') return <Setup />;
  return (
    <SyncProvider>
      {stage === 'locked' ? (
        <Unlock />
      ) : stage === 'patient' ? (
        <PatientMode />
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/new" element={<PatientNew />} />
            <Route path="patients/:id" element={<PatientDetail />} />
            <Route path="records/new" element={<AddProcedure />} />
            <Route path="procedures/new" element={<AddProcedure />} />
            <Route path="records" element={<Records />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="connect" element={<Connect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </SyncProvider>
  );
}
