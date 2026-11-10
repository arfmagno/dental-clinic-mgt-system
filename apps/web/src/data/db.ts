import Dexie, { type Table } from 'dexie';
import {
  legacyAddressRow,
  legacyPatientPatch,
  legacyPaymentRow,
  type DentalRecord,
  type Patient,
  type PatientAddress,
  type PatientContact,
  type Payment,
  type Procedure,
  type ToothEntry,
} from '@clinic/shared';

/** Every locally stored row carries `dirty`: 1 = has changes not yet pushed to the server. */
export type Local<T> = T & { dirty: 0 | 1 };

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * On-device database (IndexedDB). The UI only ever reads and writes here, which is what makes
 * the app work offline; services/syncEngine.ts reconciles it with the server in the background.
 *
 * SCHEMA CHANGES: never edit an existing version. Add `this.version(n+1).stores({...})`, and for
 * new columns/backfills add `.upgrade(tx => ...)`. In an upgrade, set `dirty: 1` and a fresh
 * `updatedAt` on rows you change so the change syncs. Pair every client change with a server
 * migration (services/api/src/migrations) — see docs/MIGRATIONS.md.
 */
export class ClinicDB extends Dexie {
  patients!: Table<Local<Patient>, string>;
  patient_contacts!: Table<Local<PatientContact>, string>;
  patient_addresses!: Table<Local<PatientAddress>, string>;
  procedures!: Table<Local<Procedure>, string>;
  payments!: Table<Local<Payment>, string>;
  dental_records!: Table<Local<DentalRecord>, string>;
  tooth_entries!: Table<Local<ToothEntry>, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'clinic') {
    super(name);
    // v1 (app 0.1.0)
    this.version(1).stores({
      patients: 'id, fullName, updatedAt, dirty',
      patient_contacts: 'id, patientId, dirty',
      procedures: 'id, patientId, date, dirty',
      dental_records: 'id, patientId, procedureId, recordedAt, dirty',
      tooth_entries: 'id, patientId, recordId, procedureId, dirty',
      meta: 'key',
    });

    // v2 (app 0.2.0): name parts, structured addresses, itemised payments.
    // Mirrors server migration 002 using the same frozen transforms (shared/legacy.ts), so rows
    // created here and on the server have identical ids and never duplicate when they sync.
    this.version(2)
      .stores({
        patients: 'id, lastName, updatedAt, dirty',
        patient_addresses: 'id, patientId, dirty',
        payments: 'id, procedureId, dirty',
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        const patients = await tx.table('patients').toArray();
        for (const p of patients) {
          const address = legacyAddressRow(p, now);
          if (address) await tx.table('patient_addresses').put({ ...address, dirty: 1 });
          const { fullName: _f, address: _a, citizenship: _c, ...rest } = p;
          await tx.table('patients').put({ ...rest, ...legacyPatientPatch(p), updatedAt: now, dirty: 1 });
        }
        const procedures = await tx.table('procedures').toArray();
        for (const p of procedures) {
          const payment = legacyPaymentRow(p, now);
          if (payment) await tx.table('payments').put({ ...payment, dirty: 1 });
          if ('paidCents' in p) {
            const { paidCents: _paid, ...rest } = p;
            await tx.table('procedures').put({ ...rest, updatedAt: now, dirty: 1 });
          }
        }
      });
  }
}

export const db = new ClinicDB();
