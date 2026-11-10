import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProcedureForm } from '../components/ProcedureForm';

/** Standalone "new procedure" page. Always needs a patient; saving also writes the dental record. */
export function AddProcedure() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  return (
    <div className="stack narrow">
      <h1>Add procedure</h1>
      <div className="card">
        <ProcedureForm patientId={params.get('patientId') ?? undefined} onSaved={(_id, patientId) => nav(`/patients/${patientId}`)} onCancel={() => nav(-1)} />
      </div>
    </div>
  );
}
