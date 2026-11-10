import type { Patient } from '@clinic/shared';

/** Case-insensitive match on name, address, occupation or any contact value; every word must match. */
export function matchesPatient(p: Patient, contactText: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${p.fullName} ${p.address} ${p.occupation} ${contactText}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
