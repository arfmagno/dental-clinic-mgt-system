import { useNavigate } from 'react-router-dom';
import { PatientForm } from '../components/PatientForm';
import { useLock } from '../hooks/useLock';
import { emptyPatient, savePatient } from '../services/patientService';

/** Staff "Add patient" view, separate from the patient list. */
export function PatientNew() {
  const nav = useNavigate();
  const { lockForPatient } = useLock();
  return (
    <div className="stack narrow">
      <div className="row between wrap">
        <h1>Add patient</h1>
        <button type="button" className="btn" onClick={lockForPatient} title="Lock the app to the registration form and hand the device to the patient">
          <span aria-hidden>🔒</span> Let the patient fill this in
        </button>
      </div>
      <div className="card">
        <PatientForm
          initial={emptyPatient()}
          initialContacts={[]}
          initialAddresses={[]}
          submitLabel="Add patient"
          savingLabel="Adding patient…"
          onCancel={() => nav(-1)}
          onSubmit={async (fields, contacts, addresses) => {
            const id = await savePatient(undefined, fields, contacts, addresses);
            nav(`/patients/${id}`, { replace: true });
          }}
        />
      </div>
    </div>
  );
}
