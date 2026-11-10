import { TOOTH_CATALOG, legacyAddressRow, legacyPatientPatch, legacyPaymentRow } from '@clinic/shared';
import type { MigrationContext } from './types.js';

const base = `
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL`;

/**
 * v0.2.0 normalisation:
 *  - name parts + salutation replace the stored full name (full name is now derived)
 *  - citizenship becomes an ISO country code (unrecognised text is preserved in remarks)
 *  - free-text address → patient_addresses (structured, many per patient)
 *  - procedures.paidCents → payments (itemised; balance = cost − Σ payments)
 *  - tooth catalog table; tooth_entries.tooth gets a real foreign key to it
 * Backfilled rows get new serverSeq values, so every device pulls them on its next sync.
 * Row transforms live in shared/legacy.ts and are shared with the on-device upgrade.
 * (Before the timestamped file names this was migration 2; existing databases are mapped.)
 */
export async function up(ctx: MigrationContext): Promise<void> {
  const { db } = ctx;
  const now = new Date().toISOString();

  // ---- tooth catalog (fixed reference data, not synced) ----
  await db.exec(`CREATE TABLE teeth (
    number INTEGER PRIMARY KEY,
    dentition TEXT NOT NULL,
    quadrant INTEGER NOT NULL,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    isUpper INTEGER NOT NULL,
    name TEXT NOT NULL)`);
  for (const t of TOOTH_CATALOG) {
    await db.run('INSERT INTO teeth (number, dentition, quadrant, position, kind, isUpper, name) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      t.number, t.dentition, t.quadrant, t.position, t.kind, t.upper, t.name,
    ]);
  }

  // ---- new columns and tables ----
  await db.exec(`
    ALTER TABLE patients ADD COLUMN salutation TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN firstName TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN middleName TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN lastName TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN citizenshipCode TEXT NOT NULL DEFAULT '';

    CREATE TABLE patient_addresses (${base},
      patientId TEXT NOT NULL REFERENCES patients(id),
      label TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      postalCode TEXT NOT NULL DEFAULT '',
      countryCode TEXT NOT NULL DEFAULT '',
      isPrimary INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_addresses_seq ON patient_addresses(serverSeq);
    CREATE INDEX idx_addresses_patient ON patient_addresses(patientId);

    CREATE TABLE payments (${base},
      procedureId TEXT NOT NULL REFERENCES procedures(id),
      amountCents INTEGER NOT NULL,
      paidAt TEXT NOT NULL,
      method TEXT NOT NULL,
      remarks TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_payments_seq ON payments(serverSeq);
    CREATE INDEX idx_payments_procedure ON payments(procedureId);
  `);

  // ---- backfill from the v1 columns ----
  await ctx.backfill('patients', (row) => legacyPatientPatch(row as never));
  for (const p of await db.all<Record<string, any>>('SELECT id, address FROM patients')) {
    const address = legacyAddressRow(p as never, now);
    if (address) await ctx.insert('patient_addresses', address);
  }
  for (const p of await db.all<Record<string, any>>('SELECT id, date, time, paidCents FROM procedures')) {
    const payment = legacyPaymentRow(p as never, now);
    if (payment) await ctx.insert('payments', payment);
  }

  // ---- drop the replaced columns ----
  await db.exec(`
    ALTER TABLE patients DROP COLUMN fullName;
    ALTER TABLE patients DROP COLUMN address;
    ALTER TABLE patients DROP COLUMN citizenship;
    ALTER TABLE procedures DROP COLUMN paidCents;
  `);

  // ---- rebuild tooth_entries with a foreign key to the catalog (SQLite cannot add one in place) ----
  const cols = 'id, createdAt, updatedAt, isDeleted, serverSeq, recordId, patientId, procedureId, tooth, condition, remarks';
  await db.exec(`
    CREATE TABLE tooth_entries_v2 (${base},
      recordId TEXT NOT NULL REFERENCES dental_records(id),
      patientId TEXT NOT NULL REFERENCES patients(id),
      procedureId TEXT REFERENCES procedures(id),
      tooth INTEGER NOT NULL REFERENCES teeth(number),
      condition TEXT NOT NULL,
      remarks TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO tooth_entries_v2 (${cols}) SELECT ${cols} FROM tooth_entries;
    DROP TABLE tooth_entries;
    ALTER TABLE tooth_entries_v2 RENAME TO tooth_entries;
    CREATE INDEX idx_teeth_seq ON tooth_entries(serverSeq);
    CREATE INDEX idx_teeth_patient ON tooth_entries(patientId, tooth);
  `);
}
