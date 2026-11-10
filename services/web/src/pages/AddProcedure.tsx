import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import { ProcedureForm } from '../components/ProcedureForm';

/** Standalone "Add Record" page (a procedure with its dental record). Always needs a patient; saving also writes the dental record. */
export function AddProcedure() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { notify } = useFeedback();
  return (
    <div className="stack narrow">
      <h1>Add Record</h1>
      <div className="card">
        <ProcedureForm patientId={params.get('patientId') ?? undefined} onSaved={(_id, patientId) => (notify('Record added'), nav(`/patients/${patientId}`))} onCancel={() => nav(-1)} />
      </div>
    </div>
  );
}
