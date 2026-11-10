import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PatientForm } from '../components/PatientForm';
import { emptyPatient, savePatient } from '../services/patientService';

/**
 * Patient-facing registration. Deliberately has no navigation, records or balances, so a patient
 * handed the device can only fill in their own details. Staff leave via the small link at the bottom.
 */
export function Intake() {
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0); // remounts the form for the next patient

  return (
    <div className="intake">
      <div className="intake-card card">
        {done ? (
          <div className="stack center-text">
            <div className="logo big" aria-hidden>✅</div>
            <h1>Thank you!</h1>
            <p>Your details have been saved. Please let the front desk know you are done.</p>
            <button className="btn primary" onClick={() => (setDone(false), setRound((r) => r + 1))}>Register another patient</button>
          </div>
        ) : (
          <>
            <h1>Patient registration</h1>
            <p className="muted">Please fill in your details. Only your name is required.</p>
            <PatientForm
              key={round}
              initial={emptyPatient()}
              initialContacts={[]}
              submitLabel="Submit"
              onSubmit={async (fields, contacts) => {
                await savePatient(undefined, fields, contacts);
                setDone(true);
                window.scrollTo({ top: 0 });
              }}
            />
          </>
        )}
      </div>
      <p className="staff-exit"><Link to="/">Staff: back to dashboard</Link></p>
    </div>
  );
}
