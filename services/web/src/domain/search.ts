import { fold, formatName, type Patient } from '@clinic/shared';

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
