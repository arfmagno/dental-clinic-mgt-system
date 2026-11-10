import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SyncProvider } from './hooks/useSync';
import { isDeviceReady } from './services/session';
import { AddProcedure } from './pages/AddProcedure';
import { Dashboard } from './pages/Dashboard';
import { Intake } from './pages/Intake';
import { Login } from './pages/Login';
import { PatientDetail } from './pages/PatientDetail';
import { Patients } from './pages/Patients';
import { Records } from './pages/Records';

export function App() {
  // A device must be signed in once; afterwards the app opens (and works) offline without a token.
  const [ready, setReady] = useState(isDeviceReady());
  useEffect(() => {
    const update = () => setReady(isDeviceReady());
    window.addEventListener('clinic:session', update);
    return () => window.removeEventListener('clinic:session', update);
  }, []);

  return (
    <BrowserRouter>
      {!ready ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <SyncProvider>
          <Routes>
            <Route path="/intake" element={<Intake />} />
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="procedures/new" element={<AddProcedure />} />
              <Route path="records" element={<Records />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SyncProvider>
      )}
    </BrowserRouter>
  );
}
