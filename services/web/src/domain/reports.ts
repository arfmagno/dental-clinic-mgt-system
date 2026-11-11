import { paidByProcedure, PAYMENT_METHOD_LABEL, type Patient, type Payment, type PaymentMethod, type Procedure } from '@clinic/shared';

/**
 * Clinic reports, computed on the device from the live rows (no server, no stored aggregates).
 * Dates are the clinic's local calendar days: procedure.date and payment.paidAt are already local;
 * patient.createdAt is UTC and is converted.
 */
export type Period = '30d' | '90d' | '12m';

export const PERIOD_LABEL: Record<Period, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' };

export interface Bucket {
  key: string; // first day of the bucket, YYYY-MM-DD
  label: string; // short axis label
  title: string; // full label for tooltips and the table
  cents: number;
}

export interface Report {
  period: Period;
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive
  collectedCents: number;
  /** Same-length period just before, for the change indicator. */
  previousCollectedCents: number;
  billedCents: number;
  /** All unpaid balances today (not limited to the period). */
  outstandingCents: number;
  owingPatients: number;
  newPatients: number;
  procedureCount: number;
  collections: Bucket[];
  topProcedures: { type: string; count: number; billedCents: number }[];
  methods: { method: PaymentMethod; label: string; cents: number }[];
  aging: { label: string; cents: number; count: number }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** The period's buckets: days for 30 days, weeks (Mon–Sun) for 90 days, calendar months for 12 months. */
function buckets(period: Period, today: Date): { from: Date; buckets: Omit<Bucket, 'cents'>[] } {
  if (period === '30d') {
    const from = addDays(today, -29);
    return {
      from,
      buckets: Array.from({ length: 30 }, (_, i) => {
        const d = addDays(from, i);
        return { key: localDay(d), label: String(d.getDate()), title: short(d) };
      }),
    };
  }
  if (period === '90d') {
    const from = addDays(today, -89);
    const monday = addDays(from, -((from.getDay() + 6) % 7));
    const out: Omit<Bucket, 'cents'>[] = [];
    for (let d = monday; d <= today; d = addDays(d, 7)) out.push({ key: localDay(d), label: short(d), title: `Week of ${short(d)}` });
    return { from, buckets: out };
  }
  const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  return {
    from,
    buckets: Array.from({ length: 12 }, (_, i) => {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      return { key: localDay(d), label: MONTHS[d.getMonth()], title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    }),
  };
}

export function buildReport(data: { patients: Patient[]; procedures: Procedure[]; payments: Payment[] }, period: Period, today = new Date()): Report {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = localDay(end);
  const { from: fromDate, buckets: shape } = buckets(period, end);
  const from = localDay(fromDate);
  const span = daysBetween(from, to) + 1;
  const prevFrom = localDay(addDays(fromDate, -span));

  // Only what is still shown in the app: live patients, their live procedures, and those procedures' live payments.
  const patients = data.patients.filter((p) => !p.isDeleted);
  const livePatients = new Set(patients.map((p) => p.id));
  const procedures = data.procedures.filter((p) => !p.isDeleted && livePatients.has(p.patientId));
  const liveProcedures = new Map(procedures.map((p) => [p.id, p]));
  const payments = data.payments.filter((y) => !y.isDeleted && liveProcedures.has(y.procedureId));

  const inRange = (day: string, a = from, b = to) => day >= a && day <= b;
  const payDay = (y: Payment) => y.paidAt.slice(0, 10);

  const periodPayments = payments.filter((y) => inRange(payDay(y)));
  const collectedCents = periodPayments.reduce((s, y) => s + y.amountCents, 0);
  const previousCollectedCents = payments.filter((y) => inRange(payDay(y), prevFrom, localDay(addDays(fromDate, -1)))).reduce((s, y) => s + y.amountCents, 0);

  const periodProcedures = procedures.filter((p) => inRange(p.date));
  const billedCents = periodProcedures.reduce((s, p) => s + p.costCents, 0);

  // collections over time: each payment goes to the last bucket that starts on or before its day
  const collections: Bucket[] = shape.map((b) => ({ ...b, cents: 0 }));
  for (const y of periodPayments) {
    const day = payDay(y);
    for (let i = collections.length - 1; i >= 0; i--) {
      if (collections[i].key <= day) {
        collections[i].cents += y.amountCents;
        break;
      }
    }
  }

  const byType = new Map<string, { type: string; count: number; billedCents: number }>();
  for (const p of periodProcedures) {
    const t = byType.get(p.type) ?? { type: p.type, count: 0, billedCents: 0 };
    t.count++;
    t.billedCents += p.costCents;
    byType.set(p.type, t);
  }
  const topProcedures = [...byType.values()].sort((a, b) => b.count - a.count || b.billedCents - a.billedCents || a.type.localeCompare(b.type)).slice(0, 6);

  const byMethod = new Map<PaymentMethod, number>();
  for (const y of periodPayments) byMethod.set(y.method, (byMethod.get(y.method) ?? 0) + y.amountCents);
  const methods = [...byMethod].map(([method, cents]) => ({ method, label: PAYMENT_METHOD_LABEL[method], cents })).sort((a, b) => b.cents - a.cents);

  // unpaid balances today, by how long ago the procedure was done
  const paid = paidByProcedure(payments);
  const aging = [
    { label: '0–30 days', cents: 0, count: 0 },
    { label: '31–90 days', cents: 0, count: 0 },
    { label: 'Over 90 days', cents: 0, count: 0 },
  ];
  const owing = new Set<string>();
  let outstandingCents = 0;
  for (const p of procedures) {
    const balance = p.costCents - (paid.get(p.id) ?? 0);
    if (balance <= 0) continue;
    outstandingCents += balance;
    owing.add(p.patientId);
    const age = daysBetween(p.date, to);
    const a = aging[age <= 30 ? 0 : age <= 90 ? 1 : 2];
    a.cents += balance;
    a.count++;
  }

  return {
    period,
    from,
    to,
    collectedCents,
    previousCollectedCents,
    billedCents,
    outstandingCents,
    owingPatients: owing.size,
    newPatients: patients.filter((p) => inRange(localDay(new Date(p.createdAt)))).length,
    procedureCount: periodProcedures.length,
    collections,
    topProcedures,
    methods,
    aging,
  };
}

/** Change against the previous period, as a whole percentage; null when there is nothing to compare with. */
export function changePercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
