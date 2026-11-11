// Column rules the server enforces on every synced row (the client's forms enforce the same).
// Small fixed vocabularies are validated codes rather than lookup tables.
import { AUDIT_ACTIONS, AUDIT_ENTITIES, CIVIL_STATUSES, CONDITIONS, CONTACT_TYPES, DENTAL_CLASSIFICATIONS, PAYMENT_METHODS, SALUTATIONS, STAFF_ROLES } from './vocab.js';
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

const isName = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
const isBase64 = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v) && v.length <= 200;
const isId = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isBool = (v: unknown) => typeof v === 'boolean' || v === 0 || v === 1;

/** Longest text each kind of field may hold (the forms use the same limits). */
export const TEXT_LIMITS = { name: 80, short: 80, label: 40, contact: 200, address: 200, note: 500, remarks: 2000 } as const;

// Control characters never belong in text; notes may keep line breaks and tabs.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_LINE = /[\u0000-\u001f\u007f]/;
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_NOTE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** A string of at most `max` characters with no control characters (`required`: not blank). */
const text =
  (max: number, { required = false, multiline = false } = {}): Rule =>
  (v) =>
    typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0) && !(multiline ? CONTROL_NOTE : CONTROL_LINE).test(v);
/** A link to another row; `optional` also accepts none (a chart update has no procedure). */
const ref =
  (optional = false): Rule =>
  (v) =>
    (optional && (v === null || v === '')) || isId(v);
/** A patient photo: none, or an image the app encoded itself (about 70 KB; 1 MB is the ceiling). */
export const PHOTO_MAX_CHARS = 1_000_000;
const isPhoto = (v: unknown) => v === '' || (typeof v === 'string' && v.length <= PHOTO_MAX_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v));
const L = TEXT_LIMITS;

const RULES: Partial<Record<SyncTable, Record<string, Rule>>> = {
  staff: { name: isName, role: oneOf(STAFF_ROLES), pinSalt: isBase64, pinHash: isBase64, pinIterations: isNonNegInt },
  patients: {
    firstName: text(L.name, { required: true }),
    middleName: text(L.name),
    lastName: text(L.name, { required: true }),
    occupation: text(L.short),
    addressLine1: text(L.address),
    remarks: text(L.remarks, { multiline: true }),
    photo: isPhoto,
    salutation: oneOf(SALUTATIONS, true),
    civilStatus: oneOf(CIVIL_STATUSES, true),
    citizenshipCode: isCountryCode,
    birthDate: isDate,
    addressCountryCode: isCountryCode,
    dentalClassification: oneOf(DENTAL_CLASSIFICATIONS, true),
  },
  patient_contacts: { patientId: ref(), type: oneOf(CONTACT_TYPES), value: text(L.contact, { required: true }), label: text(L.label), isPrimary: isBool },
  procedures: { patientId: ref(), type: text(L.short, { required: true }), date: isRequiredDate, time: isTime, costCents: isNonNegInt, remarks: text(L.remarks, { multiline: true }) },
  payments: { procedureId: ref(), amountCents: isPosInt, paidAt: isLocalDateTime, method: oneOf(PAYMENT_METHODS), remarks: text(L.note, { multiline: true }) },
  dental_records: { patientId: ref(), procedureId: ref(true), recordedAt: isLocalDateTime, remarks: text(L.remarks, { multiline: true }) },
  tooth_entries: { recordId: ref(), patientId: ref(), procedureId: ref(true), tooth: isValidTooth, condition: oneOf(CONDITIONS), remarks: text(L.note, { multiline: true }) },
  audit_log: { actor: (v) => v === '' || isId(v), action: oneOf(AUDIT_ACTIONS), entity: oneOf(AUDIT_ENTITIES), entityId: isId, patientId: (v) => v === '' || isId(v) },
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
