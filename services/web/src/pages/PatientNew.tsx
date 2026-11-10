import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PatientForm } from '../components/PatientForm';
import { useLock } from '../hooks/useLock';
import { emptyPatient, savePatient } from '../services/patientService';

/** Staff "Add patient" view, separate from the patient list. */
export function PatientNew() {
  const nav = useNavigate();
  const { lockForPatient } = useLock();
  const { notify } = useFeedback();
  return (
    <div className="stack narrow">
      <div className="row between wrap">
        <h1>Add Patient</h1>
        <button type="button" className="btn" onClick={lockForPatient} title="Lock the app to the registration form so the patient can fill it in">
          <Icon name="lock" size={18} /> Hand to patient
        </button>
      </div>
      <div className="card">
        <PatientForm
          initial={emptyPatient()}
          initialContacts={[]}
          submitLabel="Add patient"
          savingLabel="Adding patient…"
          onCancel={() => nav(-1)}
          onSubmit={async (fields, contacts) => {
            const id = await savePatient(undefined, fields, contacts);
            notify('Patient added');
            nav(`/patients/${id}`, { replace: true });
          }}
        />
      </div>
    </div>
  );
}
