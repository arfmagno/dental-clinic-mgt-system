// FROZEN — schema v1 → v2 data transforms (v0.1.0 → v0.2.0).
// Used by BOTH the server migration 002 and the on-device database upgrade (Dexie version 2),
// so a device that upgrades offline and the server produce identical rows with identical ids,
// and syncing them never creates duplicates. Do not change behaviour; add a new module instead.

/** Deterministic UUID-formatted id from a seed (cyrb128 hash). Same input → same id everywhere. */
export function deterministicUuid(seed: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  // Shape as an RFC 4122 v4-style string (version 4, variant 10xx) so it validates like other ids.
  const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

// Surname particles that belong with the last name ("Dela Cruz", "de los Santos", "San Jose").
const PARTICLES = new Set(['de', 'del', 'dela', 'delos', 'los', 'la', 'las', 'san', 'santa', 'sta.', 'van', 'von', 'da', 'dos', 'di', 'le', 'mac', 'mc']);

/** Best-effort split of a free-text v1 full name. Staff can correct the result afterwards. */
export function splitLegacyFullName(full: string): { firstName: string; middleName: string; lastName: string } {
  const t = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (t.length === 1) return { firstName: t[0], middleName: '', lastName: '' };
  let i = t.length - 1;
  while (i - 1 >= 1 && PARTICLES.has(t[i - 1].toLowerCase())) i--;
  return { firstName: t[0], middleName: t.slice(1, i).join(' '), lastName: t.slice(i).join(' ') };
}

const CITIZENSHIP: Record<string, string> = {
  filipino: 'PH', filipina: 'PH', philippine: 'PH', philippines: 'PH', pilipino: 'PH', ph: 'PH',
  american: 'US', 'united states': 'US', usa: 'US', us: 'US',
  chinese: 'CN', china: 'CN', japanese: 'JP', japan: 'JP', korean: 'KR', 'south korean': 'KR', korea: 'KR',
  indian: 'IN', india: 'IN', british: 'GB', uk: 'GB', canadian: 'CA', canada: 'CA',
  australian: 'AU', australia: 'AU', indonesian: 'ID', malaysian: 'MY', singaporean: 'SG',
  vietnamese: 'VN', thai: 'TH', taiwanese: 'TW', german: 'DE', french: 'FR', spanish: 'ES',
};

export interface LegacyPatientV1 {
  id: string;
  fullName?: string;
  address?: string;
  citizenship?: string;
  remarks?: string;
}

/** Field changes that turn a v1 patient into a v2 patient (name parts, citizenship code). */
export function legacyPatientPatch(p: LegacyPatientV1) {
  const text = String(p.citizenship ?? '').trim();
  const code = CITIZENSHIP[text.toLowerCase()] ?? '';
  // Never lose information: an unrecognised citizenship is kept in the remarks.
  const keep = text && !code ? `Citizenship (from earlier record): ${text}` : '';
  const remarks = [String(p.remarks ?? '').trim(), keep].filter(Boolean).join('\n');
  return { salutation: '', ...splitLegacyFullName(p.fullName ?? ''), citizenshipCode: code, remarks };
}

/** The v2 address row for a v1 patient's free-text address, or null if there was none. */
export function legacyAddressRow(p: LegacyPatientV1, now: string) {
  const street = String(p.address ?? '').trim();
  if (!street) return null;
  return {
    id: deterministicUuid(`v2-address:${p.id}`),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    patientId: p.id,
    label: 'Home',
    street,
    district: '',
    city: '',
    province: '',
    postalCode: '',
    countryCode: 'PH',
    isPrimary: true,
  };
}

export interface LegacyProcedureV1 {
  id: string;
  date: string;
  time?: string;
  paidCents?: number;
}

/** The v2 payment row for a v1 procedure's single "amount paid", or null if nothing was paid. */
export function legacyPaymentRow(p: LegacyProcedureV1, now: string) {
  const amount = Math.round(Number(p.paidCents ?? 0));
  if (!(amount > 0)) return null;
  return {
    id: deterministicUuid(`v2-payment:${p.id}`),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    procedureId: p.id,
    amountCents: amount,
    paidAt: `${p.date}T${p.time || '00:00'}`,
    method: 'other' as const,
    remarks: 'Recorded before payments were itemised',
  };
}
