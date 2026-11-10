import { useState, type FormEvent } from 'react';
import { CIVIL_STATUSES, SALUTATIONS } from '@clinic/shared';
import { nowLocal } from '../domain/format';
import { emptyContact, validatePatient, type ContactInput, type PatientFields } from '../services/patientService';
import { ContactsEditor } from './ContactsEditor';
import { CountrySelect } from './CountrySelect';
import { NationalitySelect } from './NationalitySelect';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  initial: PatientFields;
  initialContacts: ContactInput[];
  /** Descriptive action, e.g. "Add patient", "Save changes", "Register". */
  submitLabel: string;
  savingLabel?: string;
  cancelLabel?: string;
  onSubmit(fields: PatientFields, contacts: ContactInput[]): Promise<void>;
  onCancel(): void;
  /** 'patient' hides staff-only fields (remarks) for the patient-facing form. */
  variant?: 'staff' | 'patient';
}

export function PatientForm({ initial, initialContacts, submitLabel, savingLabel = 'Saving…', cancelLabel = 'Cancel', onSubmit, onCancel, variant = 'staff' }: Props) {
  const [f, setF] = useState(initial);
  const [contacts, setContacts] = useState<ContactInput[]>(initialContacts.length ? initialContacts : [emptyContact(true)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof PatientFields>(k: K, v: PatientFields[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validatePatient(f);
    if (problem) return setError(problem);
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
    <form className="stack form" onSubmit={submit} noValidate>
      <PhotoPicker value={f.photo} onChange={(v) => set('photo', v)} />

      <fieldset className="field name-grid">
        <legend>Name</legend>
        <label className="field">
          <span>Salutation</span>
          <select value={f.salutation} onChange={(e) => set('salutation', e.target.value)} autoComplete="honorific-prefix">
            <option value="">—</option>
            {SALUTATIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>First name *</span>
          <input required autoComplete="given-name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </label>
        <label className="field">
          <span>Middle name</span>
          <input autoComplete="additional-name" value={f.middleName} onChange={(e) => set('middleName', e.target.value)} />
        </label>
        <label className="field">
          <span>Last name *</span>
          <input required autoComplete="family-name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </label>
      </fieldset>

      <div className="grid3">
        <label className="field">
          <span>Date of birth *</span>
          <input required type="date" max={nowLocal().date} min="1900-01-01" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        </label>
        <label className="field">
          <span>Civil status</span>
          <select value={f.civilStatus} onChange={(e) => set('civilStatus', e.target.value)}>
            <option value="">—</option>
            {CIVIL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Citizenship *</span>
          <NationalitySelect required value={f.citizenshipCode} onChange={(v) => set('citizenshipCode', v)} />
        </label>
      </div>

      <label className="field">
        <span>Occupation</span>
        <input autoComplete="organization-title" value={f.occupation} onChange={(e) => set('occupation', e.target.value)} />
      </label>

      <div className="field">
        <span>Contact information</span>
        <ContactsEditor value={contacts} onChange={setContacts} />
      </div>

      <div className="address-row">
        <label className="field">
          <span>Address</span>
          <input
            autoComplete="street-address"
            placeholder="House no., street, barangay, city, province"
            value={f.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Country</span>
          <CountrySelect value={f.addressCountryCode || 'PH'} onChange={(v) => set('addressCountryCode', v)} allowEmpty={false} />
        </label>
      </div>

      {variant === 'staff' && (
        <label className="field">
          <span>Remarks</span>
          <textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </label>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button className="btn primary" disabled={saving}>{saving ? savingLabel : submitLabel}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>{cancelLabel}</button>
      </div>
    </form>
  );
}
