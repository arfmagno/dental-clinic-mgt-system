// Column rules the server enforces on every synced row (the client's forms enforce the same).
// Small fixed vocabularies are validated codes rather than lookup tables.
import { CIVIL_STATUSES, CONDITIONS, CONTACT_TYPES, DENTAL_CLASSIFICATIONS, PAYMENT_METHODS, SALUTATIONS } from './vocab.js';
import type { SyncTable } from './index.js';
import { isCountryCode } from './countries.js';
import { isValidTooth } from './teeth.js';

type Rule = (v: unknown) => boolean;

const oneOf = (values: readonly string[], allowEmpty = false): Rule => (v) => (allowEmpty && v === '') || values.includes(v as string);
const isDate = (v: unknown) => v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isRequiredDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => v === '' || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v));
const isLocalDateTime = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
const isNonNegInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isPosInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

const RULES: Partial<Record<SyncTable, Record<string, Rule>>> = {
  patients: {
    salutation: oneOf(SALUTATIONS, true),
    civilStatus: oneOf(CIVIL_STATUSES, true),
    citizenshipCode: isCountryCode,
    birthDate: isDate,
    addressCountryCode: isCountryCode,
    dentalClassification: oneOf(DENTAL_CLASSIFICATIONS, true),
  },
  patient_contacts: { type: oneOf(CONTACT_TYPES) },
  procedures: { date: isRequiredDate, time: isTime, costCents: isNonNegInt },
  payments: { amountCents: isPosInt, paidAt: isLocalDateTime, method: oneOf(PAYMENT_METHODS) },
  dental_records: { recordedAt: isLocalDateTime },
  tooth_entries: { tooth: isValidTooth, condition: oneOf(CONDITIONS) },
};

/** Returns an error message for the first invalid column present in `row`, or null. */
export function validateColumns(table: SyncTable, row: Record<string, unknown>): string | null {
  const rules = RULES[table];
  if (!rules) return null;
  for (const [col, ok] of Object.entries(rules)) {
    if (row[col] !== undefined && !ok(row[col])) return `invalid ${col}`;
  }
  return null;
}
