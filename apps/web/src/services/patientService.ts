import type { ContactType, Patient } from '@clinic/shared';
import { db } from '../data/db';
import { createRow, softDeleteRow, updateRow } from '../data/repository';

export type PatientFields = Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>;

export interface ContactInput {
  id?: string; // present when editing an existing contact
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
}

export const emptyPatient = (): PatientFields => ({
  fullName: '',
  address: '',
  birthDate: '',
  occupation: '',
  civilStatus: '',
  citizenship: '',
  photo: '',
  remarks: '',
});

/** Creates or updates a patient together with their contact list, atomically. Returns the patient id. */
export async function savePatient(id: string | undefined, fields: PatientFields, contacts: ContactInput[]): Promise<string> {
  const fullName = fields.fullName.trim();
  if (!fullName) throw new Error('Name is required');
  const clean: PatientFields = { ...fields, fullName };
  const wanted = contacts.map((c) => ({ ...c, value: c.value.trim(), label: c.label.trim() })).filter((c) => c.value);

  return db.transaction('rw', db.patients, db.patient_contacts, async () => {
    const patientId = id ?? (await createRow(db.patients, clean)).id;
    if (id) await updateRow(db.patients, id, clean);

    const existing = (await db.patient_contacts.where('patientId').equals(patientId).toArray()).filter((c) => !c.isDeleted);
    const keep = new Set<string>();
    for (const c of wanted) {
      const { id: contactId, ...data } = c;
      const current = contactId ? existing.find((e) => e.id === contactId) : undefined;
      if (current) {
        keep.add(current.id);
        const changed = current.type !== data.type || current.value !== data.value || current.label !== data.label || current.isPrimary !== data.isPrimary;
        if (changed) await updateRow(db.patient_contacts, current.id, data);
      } else {
        const created = await createRow(db.patient_contacts, { patientId, ...data });
        keep.add(created.id);
      }
    }
    for (const e of existing) if (!keep.has(e.id)) await softDeleteRow(db.patient_contacts, e.id);
    return patientId;
  });
}

/** Soft delete. Procedures and records stay in the database (and remain recoverable). */
export async function deletePatient(id: string): Promise<void> {
  await softDeleteRow(db.patients, id);
}
