import { useMemo, useState } from 'react';
import { useContactIndex, usePatientSummaries } from '../hooks/useData';
import { matchesPatient } from '../domain/search';

interface Props {
  value: string;
  onChange(patientId: string): void;
  autoFocus?: boolean;
}

/** Search-and-pick control. A procedure always needs a patient, so this is required wherever it appears. */
export function PatientPicker({ value, onChange, autoFocus }: Props) {
  const patients = usePatientSummaries();
  const contacts = useContactIndex();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const selected = patients?.find((s) => s.patient.id === value)?.patient;
  const results = useMemo(
    () => (patients ?? []).filter((s) => matchesPatient(s.patient, contacts?.get(s.patient.id) ?? '', q)).slice(0, 8),
    [patients, contacts, q],
  );

  if (selected) {
    return (
      <div className="picked">
        <strong>{selected.fullName}</strong>
        <button type="button" className="btn ghost" onClick={() => (onChange(''), setQ(''))}>Change</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input
        autoFocus={autoFocus}
        placeholder="Search patient by name or contact…"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        aria-label="Search patient"
        aria-required
      />
      {open && (
        <ul className="picker-list">
          {results.length === 0 && <li className="muted pad">{patients?.length ? 'No matching patient' : 'No patients yet — add one first'}</li>}
          {results.map(({ patient }) => (
            <li key={patient.id}>
              <button type="button" onClick={() => (onChange(patient.id), setOpen(false))}>{patient.fullName}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
