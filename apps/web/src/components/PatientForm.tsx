import { useState, type FormEvent } from 'react';
import { CIVIL_STATUSES } from '@clinic/shared';
import type { ContactInput, PatientFields } from '../services/patientService';
import { ContactsEditor } from './ContactsEditor';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  initial: PatientFields;
  initialContacts: ContactInput[];
  submitLabel: string;
  onSubmit(fields: PatientFields, contacts: ContactInput[]): Promise<void>;
  onCancel?(): void;
}

export function PatientForm({ initial, initialContacts, submitLabel, onSubmit, onCancel }: Props) {
  const [f, setF] = useState(initial);
  const [contacts, setContacts] = useState<ContactInput[]>(initialContacts.length ? initialContacts : [{ type: 'phone', value: '', label: '', isPrimary: true }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof PatientFields>(k: K, v: PatientFields[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(f, contacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={submit}>
      <PhotoPicker value={f.photo} onChange={(v) => set('photo', v)} />

      <label className="field">
        <span>Full name *</span>
        <input required autoComplete="name" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Date of birth</span>
          <input type="date" max={new Date().toISOString().slice(0, 10)} value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        </label>
        <label className="field">
          <span>Civil status</span>
          <select value={f.civilStatus} onChange={(e) => set('civilStatus', e.target.value)}>
            <option value="">—</option>
            {CIVIL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Address</span>
        <textarea rows={2} autoComplete="street-address" value={f.address} onChange={(e) => set('address', e.target.value)} />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Occupation</span>
          <input value={f.occupation} onChange={(e) => set('occupation', e.target.value)} />
        </label>
        <label className="field">
          <span>Citizenship</span>
          <input value={f.citizenship} onChange={(e) => set('citizenship', e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Contact information</span>
        <ContactsEditor value={contacts} onChange={setContacts} />
      </div>

      <label className="field">
        <span>Remarks</span>
        <textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
