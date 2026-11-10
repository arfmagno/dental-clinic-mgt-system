import { countryName, DEFAULT_COUNTRY, formatName, type Patient, type Procedure } from '@clinic/shared';

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const formatMoney = (cents: number) => peso.format(cents / 100);

const pad = (n: number) => String(n).padStart(2, '0');

/** Current local date/time, used as the default for new procedures and payments (editable). */
export function nowLocal() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export const recordedAtOf = (date: string, time: string) => `${date}T${time || '00:00'}`;

export function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date.length <= 10 ? `${date}T00:00` : date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export function ageOf(birthDate: string, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday = today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age;
}

/** The patient's address line, followed by the country when it is not the Philippines. */
export function formatAddress(p: Pick<Patient, 'addressLine1' | 'addressCountryCode'>): string {
  const line = (p.addressLine1 ?? '').trim();
  if (!line) return '';
  return p.addressCountryCode && p.addressCountryCode !== DEFAULT_COUNTRY ? `${line}, ${countryName(p.addressCountryCode)}` : line;
}

export const displayName = (p: Patient) => formatName(p);
export const formalName = (p: Patient) => formatName(p, { salutation: true });

export interface PatientSummary {
  patient: Patient;
  name: string;
  lastVisit: string; // YYYY-MM-DD or ''
  balanceCents: number;
}

/** Derived (never stored): last visit and outstanding balance come from procedures and payments. */
export function summarize(patient: Patient, procedures: Procedure[], paid: Map<string, number>): PatientSummary {
  let lastVisit = '';
  let balance = 0;
  for (const p of procedures) {
    if (p.isDeleted || p.patientId !== patient.id) continue;
    if (p.date > lastVisit) lastVisit = p.date;
    balance += p.costCents - (paid.get(p.id) ?? 0);
  }
  return { patient, name: formatName(patient), lastVisit, balanceCents: balance };
}
