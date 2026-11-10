import { legacyV3Address } from '@clinic/shared';
import type { MigrationContext } from './types.js';

/**
 * v0.3.0: one address per patient, as a single line plus a country, stored on the patient.
 * The primary (else oldest) live address from patient_addresses is folded into
 * patients.addressLine1 / addressCountryCode, then the table is dropped.
 * This is .ts (not .sql) because the device upgrade must produce the same values: both call the
 * frozen shared transform `legacyV3Address`.
 */
export async function up(ctx: MigrationContext): Promise<void> {
  const { db } = ctx;
  await db.exec(`
    ALTER TABLE patients ADD COLUMN addressLine1 TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN addressCountryCode TEXT NOT NULL DEFAULT '';
  `);

  const addresses = await db.all<Record<string, any>>('SELECT * FROM patient_addresses');
  const byPatient = new Map<string, Record<string, any>[]>();
  for (const a of addresses) byPatient.set(a.patientId, [...(byPatient.get(a.patientId) ?? []), a]);

  // Only patients whose address actually changes are re-stamped (and therefore re-pulled by devices).
  for (const [patientId, list] of byPatient) {
    const value = legacyV3Address(list as never);
    if (value.addressLine1 || value.addressCountryCode) await ctx.backfill('patients', value, 'id = ?', [patientId]);
  }

  await db.exec(`
    DROP INDEX IF EXISTS idx_addresses_seq;
    DROP INDEX IF EXISTS idx_addresses_patient;
    DROP TABLE patient_addresses;
  `);
}
