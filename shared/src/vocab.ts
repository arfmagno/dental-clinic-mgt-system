// Fixed vocabularies. No imports, so any module can use them without circular dependencies.

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

/** Swatch colour per condition (legend, PDF). The chart itself draws teeth anatomically. */
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

/** Choosing this procedure type asks for the actual type in a text box; the typed text is stored. */
export const OTHER_PROCEDURE = 'Other';

// ---------- Small fixed vocabularies (stored as validated codes, not lookup tables) ----------
export const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Mx.', 'Dr.', 'Atty.', 'Engr.', 'Prof.'] as const;
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'] as const;
export const CONTACT_TYPES = ['phone', 'email', 'messenger', 'other'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const PAYMENT_METHODS = ['cash', 'card', 'e_wallet', 'bank_transfer', 'hmo', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/**
 * Methods offered in the forms. Card and HMO are hidden until card terminals and HMO accreditation
 * are set up; they stay valid values so old records and future re-enabling need no migration.
 */
export const PAYMENT_METHODS_OFFERED: readonly PaymentMethod[] = ['cash', 'e_wallet', 'bank_transfer', 'other'];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  e_wallet: 'E-wallet (GCash, Maya…)',
  bank_transfer: 'Bank transfer',
  hmo: 'HMO',
  other: 'Other',
};
