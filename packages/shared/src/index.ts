// Shared domain model: used by the offline-first web client and the sync server.

// ---------- Conditions ----------
export const CONDITIONS = [
  'healthy',
  'cavity',
  'filled',
  'missing',
  'extracted',
  'impacted',
  'root_canal',
  'crown',
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<Condition, string> = {
  healthy: 'Healthy',
  cavity: 'Cavity',
  filled: 'Cavity filled',
  missing: 'Missing',
  extracted: 'Extracted',
  impacted: 'Impacted',
  root_canal: 'Root canal',
  crown: 'Crown',
};

export const CONDITION_COLOR: Record<Condition, string> = {
  healthy: '#f8fafc',
  cavity: '#ef4444',
  filled: '#3b82f6',
  missing: '#d1d5db',
  extracted: '#6b7280',
  impacted: '#a855f7',
  root_canal: '#f97316',
  crown: '#eab308',
};

// Procedure type -> the tooth condition it normally results in.
export const PROCEDURE_TYPES: { name: string; condition?: Condition }[] = [
  { name: 'Check-up / Charting' },
  { name: 'Cleaning (Prophylaxis)' },
  { name: 'Filling', condition: 'filled' },
  { name: 'Extraction', condition: 'extracted' },
  { name: 'Root Canal', condition: 'root_canal' },
  { name: 'Crown', condition: 'crown' },
  { name: 'Impacted Tooth Removal', condition: 'extracted' },
  { name: 'Whitening' },
  { name: 'Braces / Orthodontics' },
  { name: 'Dentures' },
  { name: 'X-ray' },
  { name: 'Other' },
];

// ---------- FDI tooth numbering ----------
export type Dentition = 'permanent' | 'primary';
export type ToothKind = 'molar' | 'premolar' | 'canine' | 'incisor';

const range = (from: number, to: number) => {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let n = from; n !== to + step; n += step) out.push(n);
  return out;
};

export const QUADRANTS: Record<Dentition, { upperRight: number[]; upperLeft: number[]; lowerRight: number[]; lowerLeft: number[] }> = {
  permanent: {
    upperRight: range(18, 11),
    upperLeft: range(21, 28),
    lowerRight: range(48, 41),
    lowerLeft: range(31, 38),
  },
  primary: {
    upperRight: range(55, 51),
    upperLeft: range(61, 65),
    lowerRight: range(85, 81),
    lowerLeft: range(71, 75),
  },
};

export function dentitionOf(tooth: number): Dentition {
  const q = Math.floor(tooth / 10);
  return q >= 5 ? 'primary' : 'permanent';
}

export function toothKind(tooth: number): ToothKind {
  const pos = tooth % 10;
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (dentitionOf(tooth) === 'primary') return 'molar';
  return pos <= 5 ? 'premolar' : 'molar';
}

export interface ToothBox {
  tooth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  upper: boolean;
}

/** Geometry shared by the on-screen SVG odontogram and the PDF export. */
export function toothLayout(d: Dentition) {
  const q = QUADRANTS[d];
  const cell = d === 'permanent' ? 34 : 44;
  const gap = 18;
  const widthOf: Record<ToothKind, number> = { molar: 30, premolar: 25, canine: 23, incisor: 21 };
  const heightOf: Record<ToothKind, number> = { molar: 34, premolar: 34, canine: 40, incisor: 38 };
  const half = q.upperRight.length * cell;
  const width = half * 2 + gap;
  const rowUpperY = 22;
  const rowLowerY = 22 + 40 + 44;
  const teeth: ToothBox[] = [];
  const place = (list: number[], x0: number, upper: boolean) => {
    list.forEach((tooth, i) => {
      const k = toothKind(tooth);
      const w = widthOf[k];
      const h = heightOf[k];
      const baseY = upper ? rowUpperY : rowLowerY;
      teeth.push({
        tooth,
        x: x0 + i * cell + (cell - w) / 2,
        y: upper ? baseY + (40 - h) : baseY,
        w,
        h,
        upper,
      });
    });
  };
  place(q.upperRight, 0, true);
  place(q.upperLeft, half + gap, true);
  place(q.lowerRight, 0, false);
  place(q.lowerLeft, half + gap, false);
  return { teeth, width, height: rowLowerY + 40 + 22, half, gap, rowUpperY, rowLowerY };
}

// ---------- Rows ----------
export interface BaseRow {
  id: string; // uuid
  createdAt: string; // ISO
  updatedAt: string; // ISO
  isDeleted: boolean; // soft delete
}

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'] as const;
export const CONTACT_TYPES = ['phone', 'email', 'messenger', 'other'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export interface Patient extends BaseRow {
  fullName: string;
  address: string;
  birthDate: string; // YYYY-MM-DD or ''
  occupation: string;
  civilStatus: string;
  citizenship: string;
  photo: string; // compressed data URL or ''
  remarks: string;
}

export interface PatientContact extends BaseRow {
  patientId: string;
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
}

export interface Procedure extends BaseRow {
  patientId: string;
  type: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  costCents: number;
  paidCents: number;
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
  tooth: number; // FDI
  condition: Condition;
  remarks: string;
}

// ---------- Sync definition ----------
// Order matters: parents before children (server enforces foreign keys).
export const SYNC_TABLES = ['patients', 'patient_contacts', 'procedures', 'dental_records', 'tooth_entries'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const BASE_COLUMNS = ['id', 'createdAt', 'updatedAt', 'isDeleted'] as const;
export const TABLE_COLUMNS: Record<SyncTable, readonly string[]> = {
  patients: ['fullName', 'address', 'birthDate', 'occupation', 'civilStatus', 'citizenship', 'photo', 'remarks'],
  patient_contacts: ['patientId', 'type', 'value', 'label', 'isPrimary'],
  procedures: ['patientId', 'type', 'date', 'time', 'costCents', 'paidCents', 'remarks'],
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

// ---------- Helpers ----------
export const toCents = (pesos: number | string) => Math.round(Number(pesos || 0) * 100);
export const fromCents = (cents: number) => cents / 100;
export const balanceCents = (p: Pick<Procedure, 'costCents' | 'paidCents'>) => p.costCents - p.paidCents;
