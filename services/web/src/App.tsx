import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LockProvider, useLock } from './hooks/useLock';
import { SyncProvider } from './hooks/useSync';
import { AddProcedure } from './pages/AddProcedure';
import { Connect } from './pages/Connect';
import { Dashboard } from './pages/Dashboard';
import { PatientMode, SetupPin, Unlock } from './pages/LockScreens';
import { PatientDetail } from './pages/PatientDetail';
import { PatientNew } from './pages/PatientNew';
import { Patients } from './pages/Patients';
import { Records } from './pages/Records';

export function App() {
  return (
    <LockProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </LockProvider>
  );
}

/**
 * The staff PIN gates everything. Patient mode (isolated registration) is entered only via the
 * Lock button; sync keeps running in the background in every stage.
 */
function Gate() {
  const { stage } = useLock();
  if (stage === 'setup') return <SetupPin />;
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
            <Route path="procedures/new" element={<AddProcedure />} />
            <Route path="records" element={<Records />} />
            <Route path="connect" element={<Connect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </SyncProvider>
  );
}
