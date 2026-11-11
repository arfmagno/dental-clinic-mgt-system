import { DIAL_CODES, fold, formatName, parsePhone, type Patient, type PatientContact } from '@clinic/shared';

/**
 * Accent- and case-insensitive match on name (any order), occupation, contact values and
 * address text; every word typed must match something.
 */
export function matchesPatient(p: Patient, extraText: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${formatName(p, { salutation: true })} ${p.occupation} ${extraText}`);
  return words.every((w) => hay.includes(w));
}

/**
 * Searchable text for a contact. Phones are stored as "+63 917 123 4567" but people type
 * "0917 123 4567" or "09171234567", so the local and digits-only forms are added too.
 */
export function contactSearchText(c: Pick<PatientContact, 'type' | 'value'>): string {
  if (c.type !== 'phone') return c.value;
  const { country, national } = parsePhone(c.value);
  const digits = national.replace(/\D/g, '');
  return `${c.value} 0${national} 0${digits} ${DIAL_CODES[country] ?? ''}${digits}`;
}
