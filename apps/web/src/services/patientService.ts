import { DEFAULT_COUNTRY, type ContactType, type Patient } from '@clinic/shared';
import type { Table } from 'dexie';
import { db, type Local } from '../data/db';
import { createRow, softDeleteRow, updateRow } from '../data/repository';

export type PatientFields = Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>;

export interface ContactInput {
  id?: string; // present when editing an existing contact
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
}

export interface AddressInput {
  id?: string;
  label: string;
  street: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
  isPrimary: boolean;
}

export const emptyPatient = (): PatientFields => ({
  salutation: '',
  firstName: '',
  middleName: '',
  lastName: '',
  birthDate: '',
  occupation: '',
  civilStatus: '',
  citizenshipCode: DEFAULT_COUNTRY,
  photo: '',
  remarks: '',
});

export const emptyContact = (isPrimary: boolean): ContactInput => ({ type: 'phone', value: '', label: '', isPrimary });
export const emptyAddress = (isPrimary: boolean): AddressInput => ({
  label: 'Home', street: '', district: '', city: '', province: '', postalCode: '', countryCode: DEFAULT_COUNTRY, isPrimary,
});

const addressIsBlank = (a: AddressInput) => ![a.street, a.district, a.city, a.province, a.postalCode].some((s) => s.trim());

/** Exactly one primary among the given items (the first marked one, else the first item). */
export function withSinglePrimary<T extends { isPrimary: boolean }>(items: T[]): T[] {
  const idx = Math.max(0, items.findIndex((i) => i.isPrimary));
  return items.map((i, n) => ({ ...i, isPrimary: n === idx }));
}

export function validatePatient(f: PatientFields): string | null {
  if (!f.firstName.trim()) return 'First name is required';
  if (!f.lastName.trim()) return 'Last name is required';
  if (f.birthDate && f.birthDate > new Date().toISOString().slice(0, 10)) return 'Date of birth cannot be in the future';
  return null;
}

/** Syncs a child list (contacts or addresses) to the wanted state: update, create, soft-delete. */
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

/** Creates or updates a patient with their contacts and addresses, atomically. Returns the id. */
export async function savePatient(id: string | undefined, fields: PatientFields, contacts: ContactInput[], addresses: AddressInput[]): Promise<string> {
  const clean: PatientFields = {
    ...fields,
    salutation: fields.salutation.trim(),
    firstName: fields.firstName.trim(),
    middleName: fields.middleName.trim(),
    lastName: fields.lastName.trim(),
    occupation: fields.occupation.trim(),
    remarks: fields.remarks.trim(),
  };
  const problem = validatePatient(clean);
  if (problem) throw new Error(problem);

  const wantedContacts = withSinglePrimary(
    contacts.map((c) => ({ ...c, value: c.value.trim(), label: c.label.trim() })).filter((c) => c.value),
  );
  const wantedAddresses = withSinglePrimary(
    addresses.map((a) => ({ ...a, street: a.street.trim(), district: a.district.trim(), city: a.city.trim(), province: a.province.trim(), postalCode: a.postalCode.trim() })).filter((a) => !addressIsBlank(a)),
  );

  return db.transaction('rw', db.patients, db.patient_contacts, db.patient_addresses, async () => {
    const patientId = id ?? (await createRow(db.patients, clean)).id;
    if (id) await updateRow(db.patients, id, clean);

    const contactsNow = (await db.patient_contacts.where('patientId').equals(patientId).toArray()).filter((c) => !c.isDeleted);
    await reconcile(db.patient_contacts, contactsNow, wantedContacts, ({ id: _id, ...c }) => ({ patientId, ...c }));

    const addressesNow = (await db.patient_addresses.where('patientId').equals(patientId).toArray()).filter((a) => !a.isDeleted);
    await reconcile(db.patient_addresses, addressesNow, wantedAddresses, ({ id: _id, ...a }) => ({ patientId, ...a }));
    return patientId;
  });
}

/** Soft delete. Procedures, payments and records stay in the database (and remain recoverable). */
export async function deletePatient(id: string): Promise<void> {
  await softDeleteRow(db.patients, id);
}
