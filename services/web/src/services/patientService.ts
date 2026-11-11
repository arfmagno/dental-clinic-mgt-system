import { DEFAULT_CITIZENSHIP, DEFAULT_COUNTRY, DENTAL_CLASSIFICATIONS, formatPhone, parsePhone, type ContactType, type Patient } from '@clinic/shared';
import type { Table } from 'dexie';
import { db, type Local } from '../data/db';
import { createRow, softDeleteRow, updateRow, writeTx } from '../data/repository';
import { requireAdmin } from './staffService';

export type PatientFields = Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>;

export interface ContactInput {
  id?: string; // present when editing an existing contact
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
  /** Phone only, form state: the chosen country when several share a calling code (not stored). */
  country?: string;
}

export const emptyPatient = (): PatientFields => ({
  salutation: '',
  firstName: '',
  middleName: '',
  lastName: '',
  birthDate: '',
  occupation: '',
  civilStatus: '',
  citizenshipCode: DEFAULT_CITIZENSHIP,
  addressLine1: '',
  addressCountryCode: DEFAULT_COUNTRY,
  photo: '',
  remarks: '',
  dentalClassification: 'permanent', // Adult by default (owner's choice); '' = suggest from age
});

export const emptyContact = (isPrimary: boolean): ContactInput => ({ type: 'phone', value: '', label: '', isPrimary });

/** Exactly one primary among the given items (the first marked one, else the first item). */
export function withSinglePrimary<T extends { isPrimary: boolean }>(items: T[]): T[] {
  const idx = Math.max(0, items.findIndex((i) => i.isPrimary));
  return items.map((i, n) => ({ ...i, isPrimary: n === idx }));
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Form rules. Date of birth and citizenship are required for new and edited patients; the server
 * stays lenient on them so older records (created before they were required) still sync.
 */
export function validatePatient(f: PatientFields): string | null {
  if (!f.firstName.trim()) return 'First name is required';
  if (!f.lastName.trim()) return 'Last name is required';
  if (!f.birthDate) return 'Date of birth is required';
  if (f.birthDate > todayLocal()) return 'Date of birth cannot be in the future';
  if (f.birthDate < '1900-01-01') return 'Check the date of birth';
  if (!f.citizenshipCode) return 'Citizenship is required';
  if (f.dentalClassification && !DENTAL_CLASSIFICATIONS.includes(f.dentalClassification)) return 'Choose a dental classification';
  return null;
}

/** Syncs a child list to the wanted state: update, create, soft-delete. */
async function reconcile<T extends { id?: string }, R extends { id: string; isDeleted: boolean }>(
  table: Table<Local<R>, string>,
  existing: R[],
  wanted: T[],
  toFields: (item: T) => Record<string, unknown>,
) {
  const keep = new Set<string>();
  for (const item of wanted) {
    const fields = toFields(item);
    const current = item.id ? existing.find((e) => e.id === item.id) : undefined;
    if (current) {
      keep.add(current.id);
      const changed = Object.entries(fields).some(([k, v]) => (current as Record<string, unknown>)[k] !== v);
      if (changed) await updateRow(table as never, current.id, fields as never);
    } else {
      keep.add((await createRow(table as never, fields as never)).id);
    }
  }
  for (const e of existing) if (!keep.has(e.id)) await softDeleteRow(table as never, e.id);
}

/** Creates or updates a patient with their contacts, atomically. Returns the id. */
export async function savePatient(id: string | undefined, fields: PatientFields, contacts: ContactInput[]): Promise<string> {
  const clean: PatientFields = {
    ...fields,
    salutation: fields.salutation.trim(),
    firstName: fields.firstName.trim(),
    middleName: fields.middleName.trim(),
    lastName: fields.lastName.trim(),
    occupation: fields.occupation.trim(),
    addressLine1: fields.addressLine1.trim(),
    // a country without an address line says nothing; keep it only when there is an address
    addressCountryCode: fields.addressLine1.trim() ? fields.addressCountryCode : '',
    remarks: fields.remarks.trim(),
  };
  const problem = validatePatient(clean);
  if (problem) throw new Error(problem);

  const wantedContacts = withSinglePrimary(
    contacts
      .map(({ country, ...c }) => {
        const value = c.value.trim();
        // phones are kept as "+63 917 123 4567"; older numbers without a country code are read as PH
        const p = c.type === 'phone' && value ? parsePhone(value, country) : null;
        return { ...c, value: p ? formatPhone(p.country, p.national).trim() : value, label: c.label.trim() };
      })
      .filter((c) => c.value),
  );
  return writeTx([db.patients, db.patient_contacts], async () => {
    const patientId = id ?? (await createRow(db.patients, clean)).id;
    if (id) await updateRow(db.patients, id, clean);

    const contactsNow = (await db.patient_contacts.where('patientId').equals(patientId).toArray()).filter((c) => !c.isDeleted);
    await reconcile(db.patient_contacts, contactsNow, wantedContacts, ({ id: _id, ...c }) => ({ patientId, ...c }));

    return patientId;
  });
}

/** Soft delete. Procedures, payments and records stay in the database (and remain recoverable). */
/** Admin only. A soft delete: the patient's records stay (and sync) but are no longer shown. */
export async function deletePatient(id: string): Promise<void> {
  await requireAdmin();
  await writeTx(db.patients, () => softDeleteRow(db.patients, id));
}
