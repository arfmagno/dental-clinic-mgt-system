// FROZEN — schema v2 → v3 data transforms (v0.2.0 → v0.3.0).
// Used by BOTH the server migration 20261111090000-single-address and the on-device database
// upgrade (Dexie version 3), so both produce identical values. Do not change behaviour.

export interface LegacyAddressV2 {
  id: string;
  createdAt: string;
  isDeleted: boolean | number;
  isPrimary: boolean | number;
  street?: string;
  district?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  countryCode?: string;
}

/**
 * Collapses a patient's v2 addresses into the single v3 address: the primary live address
 * (else the oldest live one) as one line ("12 Mabini St, Brgy. 1, Quezon City, Metro Manila 1100")
 * plus its country. No live address → empty line and empty country.
 */
export function legacyV3Address(addresses: LegacyAddressV2[]): { addressLine1: string; addressCountryCode: string } {
  const live = addresses.filter((a) => !a.isDeleted);
  if (!live.length) return { addressLine1: '', addressCountryCode: '' };
  const chosen =
    live.find((a) => !!a.isPrimary) ??
    [...live].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
  const s = (v: string | undefined) => String(v ?? '').trim();
  const line = [s(chosen.street), s(chosen.district), s(chosen.city), [s(chosen.province), s(chosen.postalCode)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return { addressLine1: line, addressCountryCode: s(chosen.countryCode) };
}
