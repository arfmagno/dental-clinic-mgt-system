// Shared domain model: used by the offline-first web client and the sync server.
export * from './teeth.js';
export * from './names.js';
export * from './countries.js';
export * from './phone.js';
export * from './validation.js';
export * from './legacy.js';
export * from './legacy-v3.js';
export * from './nationalities.js';
export * from './vocab.js';
export * from './demo.js';
import type { Condition, ContactType, DentalClassification, PaymentMethod } from './vocab.js';

// ---------- Rows ----------
export interface BaseRow {
  id: string; // uuid
  createdAt: string; // ISO
  updatedAt: string; // ISO
  isDeleted: boolean; // soft delete
}

/** Full name is never stored; it is derived from the parts (see names.ts). */
export interface Patient extends BaseRow {
  salutation: string; // one of SALUTATIONS or ''
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD or ''
  occupation: string;
  civilStatus: string; // one of CIVIL_STATUSES or ''
  citizenshipCode: string; // ISO 3166-1 alpha-2 of the country of citizenship (PH = Filipino); shown as a nationality
  addressLine1: string; // one free-text line: house no., street, barangay, city, province, postal code
  addressCountryCode: string; // ISO 3166-1 alpha-2, or '' when there is no address
  photo: string; // compressed data URL or ''
  remarks: string;
  /** Which dental chart applies (see vocab.ts); '' = not chosen, suggested from age. Absent on rows created before the field existed. */
  dentalClassification?: DentalClassification | '';
}

export interface PatientContact extends BaseRow {
  patientId: string;
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean; // exactly one primary per patient (enforced by the service)
}

export interface Procedure extends BaseRow {
  patientId: string;
  type: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  costCents: number;
  remarks: string;
}

/** Money received for a procedure. Balance = cost − Σ payments. */
export interface Payment extends BaseRow {
  procedureId: string;
  amountCents: number; // > 0
  paidAt: string; // local YYYY-MM-DDTHH:mm
  method: PaymentMethod;
  remarks: string;
}

/** One dated entry in a patient's dental history. Usually created together with a procedure. */
export interface DentalRecord extends BaseRow {
  patientId: string;
  procedureId: string | null;
  recordedAt: string; // local YYYY-MM-DDTHH:mm (orders same-day entries)
  remarks: string;
}

/** Per-tooth state captured by a dental record. The current chart = latest entry per tooth. */
export interface ToothEntry extends BaseRow {
  recordId: string;
  patientId: string;
  procedureId: string | null;
  tooth: number; // FDI number; references the tooth catalog
  condition: Condition;
  remarks: string;
}

// ---------- Sync definition ----------
// Order matters: parents before children (server enforces foreign keys).
export const SYNC_TABLES = [
  'patients',
  'patient_contacts',
  'procedures',
  'payments',
  'dental_records',
  'tooth_entries',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const BASE_COLUMNS = ['id', 'createdAt', 'updatedAt', 'isDeleted'] as const;
export const TABLE_COLUMNS: Record<SyncTable, readonly string[]> = {
  patients: ['salutation', 'firstName', 'middleName', 'lastName', 'birthDate', 'occupation', 'civilStatus', 'citizenshipCode', 'addressLine1', 'addressCountryCode', 'photo', 'remarks', 'dentalClassification'],
  patient_contacts: ['patientId', 'type', 'value', 'label', 'isPrimary'],
  procedures: ['patientId', 'type', 'date', 'time', 'costCents', 'remarks'],
  payments: ['procedureId', 'amountCents', 'paidAt', 'method', 'remarks'],
  dental_records: ['patientId', 'procedureId', 'recordedAt', 'remarks'],
  tooth_entries: ['recordId', 'patientId', 'procedureId', 'tooth', 'condition', 'remarks'],
};
export const BOOLEAN_COLUMNS = new Set(['isDeleted', 'isPrimary']);

export type AnyRow = Record<string, unknown> & BaseRow;
export interface PushRequest {
  changes: Partial<Record<SyncTable, AnyRow[]>>;
}
export interface PushResponse {
  accepted: Partial<Record<SyncTable, string[]>>; // applied
  stale: Partial<Record<SyncTable, string[]>>; // server had a newer version; client should pull
  rejected: { table: string; id: string; error: string }[];
}
export interface PullResponse {
  rows: { table: SyncTable; row: AnyRow }[];
  cursor: number;
  hasMore: boolean;
}

// ---------- Money ----------
export const toCents = (pesos: number | string) => Math.round(Number(pesos || 0) * 100);
export const fromCents = (cents: number) => cents / 100;
/** Sum of live payments per procedure id. */
export function paidByProcedure(payments: Pick<Payment, 'procedureId' | 'amountCents' | 'isDeleted'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) if (!p.isDeleted) m.set(p.procedureId, (m.get(p.procedureId) ?? 0) + p.amountCents);
  return m;
}
