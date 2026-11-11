import { useState, type FormEvent } from 'react';
import {
  CIVIL_STATUSES,
  DENTAL_CLASSIFICATIONS,
  DENTAL_CLASSIFICATION_LABEL,
  SALUTATIONS,
  suggestDentalClassification,
  TEXT_LIMITS,
  type DentalClassification,
} from '@clinic/shared';
import { ageOf, nowLocal } from '../domain/format';
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
          <input required maxLength={TEXT_LIMITS.name} autoComplete="given-name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </label>
        <label className="field">
          <span>Middle name</span>
          <input maxLength={TEXT_LIMITS.name} autoComplete="additional-name" value={f.middleName} onChange={(e) => set('middleName', e.target.value)} />
        </label>
        <label className="field">
          <span>Last name *</span>
          <input required maxLength={TEXT_LIMITS.name} autoComplete="family-name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
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

      <div className={variant === 'staff' ? 'grid2' : undefined}>
        <label className="field">
          <span>Occupation</span>
          <input maxLength={TEXT_LIMITS.short} autoComplete="organization-title" value={f.occupation} onChange={(e) => set('occupation', e.target.value)} />
        </label>
        {variant === 'staff' && (
          <label className="field">
            <span>Dental classification</span>
            <select value={f.dentalClassification} onChange={(e) => set('dentalClassification', e.target.value as DentalClassification | '')}>
              <option value="">By age: {DENTAL_CLASSIFICATION_LABEL[suggestDentalClassification(ageOf(f.birthDate))]}</option>
              {DENTAL_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{DENTAL_CLASSIFICATION_LABEL[c]}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="field">
        <span>Contact information</span>
        <ContactsEditor value={contacts} onChange={setContacts} />
      </div>

      <div className="address-row">
        <label className="field">
          <span>Address</span>
          <input
            autoComplete="street-address"
            maxLength={TEXT_LIMITS.address}
            placeholder="House no., street, barangay, city, province"
            value={f.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Country</span>
          <CountrySelect value={f.addressCountryCode || 'PH'} onChange={(v) => set('addressCountryCode', v)} allowEmpty={false} aria-label="Country" />
        </label>
      </div>

      {variant === 'staff' && (
        <label className="field">
          <span>Remarks</span>
          <textarea rows={2} maxLength={TEXT_LIMITS.remarks} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </label>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>{saving ? savingLabel : submitLabel}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>{cancelLabel}</button>
      </div>
    </form>
  );
}
