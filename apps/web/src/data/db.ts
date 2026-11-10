import Dexie, { type Table } from 'dexie';
import type { DentalRecord, Patient, PatientContact, Procedure, ToothEntry } from '@clinic/shared';

/** Every locally stored row carries `dirty`: 1 = has changes not yet pushed to the server. */
export type Local<T> = T & { dirty: 0 | 1 };

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * On-device database (IndexedDB). The UI only ever reads and writes here, which is what makes
 * the app work offline; data/sync.ts reconciles it with the server in the background.
 *
 * SCHEMA CHANGES: never edit an existing version. Add `this.version(n+1).stores({...})`, and for
 * new columns/backfills add `.upgrade(tx => ...)`. In an upgrade, set `dirty: 1` and a fresh
 * `updatedAt` on rows you change so the backfill syncs to the server. Pair every client change
 * with a server migration (apps/server/src/migrations) — see docs/MIGRATIONS.md.
 */
export class ClinicDB extends Dexie {
  patients!: Table<Local<Patient>, string>;
  patient_contacts!: Table<Local<PatientContact>, string>;
  procedures!: Table<Local<Procedure>, string>;
  dental_records!: Table<Local<DentalRecord>, string>;
  tooth_entries!: Table<Local<ToothEntry>, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'clinic') {
    super(name);
    this.version(1).stores({
      patients: 'id, fullName, updatedAt, dirty',
      patient_contacts: 'id, patientId, dirty',
      procedures: 'id, patientId, date, dirty',
      dental_records: 'id, patientId, procedureId, recordedAt, dirty',
      tooth_entries: 'id, patientId, recordId, procedureId, dirty',
      meta: 'key',
    });
  }
}

export const db = new ClinicDB();
