import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePatientSummaries, useSearchIndex } from '../hooks/useData';
import { matchesPatient } from '../domain/search';

interface Props {
  value: string;
  onChange(patientId: string): void;
  autoFocus?: boolean;
}

/**
 * Search-and-pick control. The suggestion list closes when focus leaves the control, on Escape,
 * on outside click, and after picking. A procedure always needs a patient.
 */
export function PatientPicker({ value, onChange, autoFocus }: Props) {
  const patients = usePatientSummaries();
  const index = useSearchIndex();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = patients?.find((s) => s.patient.id === value);
  const results = useMemo(
    () => (patients ?? []).filter((s) => matchesPatient(s.patient, index?.get(s.patient.id) ?? '', q)).slice(0, 8),
    [patients, index, q],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };

  if (selected) {
    return (
      <div className="picked">
        <strong>{selected.name}</strong>
        <button type="button" className="btn ghost" onClick={() => onChange('')}>Change patient</button>
      </div>
    );
  }

  const empty = patients !== undefined && patients.length === 0;
  return (
    <div
      className="picker"
      ref={root}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <input
        autoFocus={autoFocus}
        placeholder="Search patient by name, phone, address…"
        value={q}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search patient"
        aria-required
        onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setActive((a) => Math.min(a + 1, results.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          else if (e.key === 'Enter' && open && results[active]) (e.preventDefault(), pick(results[active].patient.id));
        }}
      />
      {open && (
        <ul className="picker-list" id={listId} role="listbox">
          {empty ? (
            <li className="muted pad">
              No patients yet. <Link to="/patients/new">Add a patient</Link>
            </li>
          ) : results.length === 0 ? (
            <li className="muted pad">No matching patient</li>
          ) : (
            results.map((s, i) => (
              <li key={s.patient.id} role="option" aria-selected={i === active}>
                <button type="button" className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => pick(s.patient.id)}>
                  {s.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
