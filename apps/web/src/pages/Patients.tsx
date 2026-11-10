import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ageOf, formatDate, formatMoney } from '../domain/format';
import { matchesPatient } from '../domain/search';
import { useContactIndex, usePatientSummaries } from '../hooks/useData';

export function Patients() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const summaries = usePatientSummaries();
  const contacts = useContactIndex();

  const shown = useMemo(() => (summaries ?? []).filter((s) => matchesPatient(s.patient, contacts?.get(s.patient.id) ?? '', q)), [summaries, contacts, q]);

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Patients</h1>
        <Link to="/intake" className="btn primary">+ Add patient</Link>
      </div>
      <input
        type="search"
        className="search"
        placeholder="Search by name, address, phone, email…"
        aria-label="Search patients"
        autoFocus={params.get('focus') === '1'}
        value={q}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />
      {summaries === undefined ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="card muted">{summaries.length ? 'No patients match your search.' : 'No patients yet.'}</p>
      ) : (
        <ul className="plist">
          {shown.map(({ patient, lastVisit, balanceCents }) => {
            const age = ageOf(patient.birthDate);
            return (
              <li key={patient.id}>
                <Link to={`/patients/${patient.id}`} className="card prow">
                  <div className="avatar">{patient.photo ? <img src={patient.photo} alt="" /> : <span aria-hidden>👤</span>}</div>
                  <div className="grow">
                    <strong>{patient.fullName}</strong>
                    <div className="muted small">
                      {[age !== null && `${age} yrs`, patient.occupation].filter(Boolean).join(' · ') || 'No details yet'}
                    </div>
                  </div>
                  <div className="right small">
                    <div className="muted">{lastVisit ? `Last visit ${formatDate(lastVisit)}` : 'No visits'}</div>
                    {balanceCents > 0 && <div className="owed">Owes {formatMoney(balanceCents)}</div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
