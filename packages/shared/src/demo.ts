// Sample data for trying the app ("Load sample data" in development, `npm run seed` on a server,
// and the e2e tests). Deterministic: the same seed always produces the same rows and ids, so
// loading twice updates instead of duplicating, and the rows can be removed again by id.
import { deterministicUuid } from './legacy.js';
import { QUADRANTS } from './teeth.js';
import type { Condition, PaymentMethod } from './vocab.js';
import type { AnyRow, SyncTable } from './index.js';

export const DEMO_ID_PREFIX = 'demo';
export const demoId = (key: string) => deterministicUuid(`${DEMO_ID_PREFIX}:${key}`);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_F = ['Maria', 'Ana', 'Josefina', 'Kristine', 'Andrea', 'Patricia', 'Liza', 'Carmela', 'Bea', 'Angelica', 'Rosario', 'Nicole', 'Sofia', 'Isabel', 'Joy', 'Camille'];
const FIRST_M = ['Juan', 'Jose', 'Miguel', 'Paolo', 'Mark', 'Rafael', 'Carlo', 'Antonio', 'Gabriel', 'Ramon', 'Jericho', 'Angelo', 'Daniel', 'Emmanuel', 'Noel', 'Joshua'];
const MIDDLE = ['Reyes', 'Santos', 'Garcia', 'Mendoza', 'Bautista', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Navarro', '', ''];
const LAST = [
  'Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Bautista', 'Ocampo', 'Mendoza', 'Torres', 'Tomas', 'Andrada', 'Castillo', 'Flores',
  'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado', 'de los Santos', 'Peñaflor', 'Ñañez',
  'Lim', 'Tan', 'Uy', 'Yap', 'Gonzales', 'Ignacio', 'Katigbak', 'Evangelista', 'Hernandez', 'Jimenez', 'Quiambao', 'Zamora', 'Umali', 'Wong', 'Pascual',
];
const OCCUPATIONS = ['Teacher', 'Nurse', 'Engineer', 'Student', 'Call center agent', 'Driver', 'Vendor', 'Accountant', 'Retired', 'Farmer', 'OFW', 'Business owner', ''];
const STREETS = ['Mabini St', 'Rizal Ave', 'Bonifacio St', 'Luna St', 'Del Pilar St', 'Burgos St', 'Aguinaldo Hwy', 'Quezon Blvd', 'Roxas Blvd', 'Katipunan Ave'];
const PLACES = [
  ['Brgy. San Roque', 'Quezon City', 'Metro Manila', '1100'],
  ['Brgy. Poblacion', 'Makati', 'Metro Manila', '1210'],
  ['Brgy. Kapitolyo', 'Pasig', 'Metro Manila', '1603'],
  ['Brgy. Lahug', 'Cebu City', 'Cebu', '6000'],
  ['Brgy. Talamban', 'Cebu City', 'Cebu', '6000'],
  ['Brgy. Bajada', 'Davao City', 'Davao del Sur', '8000'],
  ['Brgy. Malabanias', 'Angeles', 'Pampanga', '2009'],
  ['Brgy. Dasmariñas', 'Dasmariñas', 'Cavite', '4114'],
];
const FOREIGN: [string, string][] = [['US', '1200 Pine St, Seattle, WA 98101'], ['JP', '2-1 Shibuya, Tokyo 150-0002'], ['KR', '15 Teheran-ro, Gangnam-gu, Seoul']];

interface ProcSpec { type: string; cost: [number, number]; condition?: Condition; teeth?: [number, number] }
const PROCS: ProcSpec[] = [
  { type: 'Check-up / Charting', cost: [500, 800] },
  { type: 'Cleaning (Prophylaxis)', cost: [1000, 1800] },
  { type: 'Filling', cost: [1200, 2500], condition: 'filled', teeth: [1, 3] },
  { type: 'Extraction', cost: [1000, 2000], condition: 'extracted', teeth: [1, 2] },
  { type: 'Root Canal', cost: [6000, 12000], condition: 'root_canal', teeth: [1, 1] },
  { type: 'Crown', cost: [8000, 18000], condition: 'crown', teeth: [1, 1] },
  { type: 'Impacted Tooth Removal', cost: [8000, 15000], condition: 'extracted', teeth: [1, 1] },
  { type: 'X-ray', cost: [500, 1000] },
  { type: 'Whitening', cost: [5000, 9000] },
  { type: 'Gum treatment', cost: [2500, 4000] }, // typed under "Other"
];

export interface DemoOptions {
  patients?: number;
  seed?: number;
  /** Treat this as "today" (local date YYYY-MM-DD). */
  today?: string;
  /** ISO timestamp for createdAt/updatedAt. */
  now?: string;
}

/** Rows for every synced table, parents first, ready for a push or a local insert. */
export function buildDemoData(opts: DemoOptions = {}): Record<SyncTable, AnyRow[]> {
  const r = rng(opts.seed ?? 20261111);
  const now = opts.now ?? new Date().toISOString();
  const today = opts.today ?? now.slice(0, 10);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const daysAgo = (n: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const base = (id: string) => ({ id, createdAt: now, updatedAt: now, isDeleted: false });
  const out: Record<SyncTable, AnyRow[]> = { patients: [], patient_contacts: [], procedures: [], payments: [], dental_records: [], tooth_entries: [] };

  const count = opts.patients ?? 60;
  for (let i = 0; i < count; i++) {
    const female = r() < 0.55;
    const pid = demoId(`patient:${i}`);
    const year = r() < 0.15 ? int(2015, 2020) : int(1948, 2006);
    const child = year >= 2015;
    const foreign = r() < 0.08 ? pick(FOREIGN) : null;
    const [district, city, province, postal] = pick(PLACES);
    const lastName = pick(LAST);
    const first = pick(female ? FIRST_F : FIRST_M);
    out.patients.push({
      ...base(pid),
      salutation: child ? '' : r() < 0.25 ? pick(female ? ['Ms.', 'Mrs.', 'Dr.'] : ['Mr.', 'Dr.', 'Engr.', 'Atty.']) : '',
      firstName: first,
      middleName: pick(MIDDLE),
      lastName,
      birthDate: `${year}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
      occupation: child ? 'Student' : pick(OCCUPATIONS),
      civilStatus: child ? 'Single' : pick(['Single', 'Married', 'Married', 'Widowed', '']),
      citizenshipCode: foreign ? foreign[0] : 'PH',
      addressLine1: r() < 0.1 ? '' : foreign ? foreign[1] : `${int(1, 250)} ${pick(STREETS)}, ${district}, ${city}, ${province} ${postal}`,
      addressCountryCode: foreign ? foreign[0] : 'PH',
      photo: '',
      remarks: r() < 0.12 ? pick(['Allergic to penicillin', 'Hypertensive; check BP before procedures', 'Prefers afternoon appointments', 'Anxious patient']) : '',
    });

    // contacts: a primary phone, sometimes an email or Messenger
    const handle = `${first}.${lastName}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z.]/g, '');
    out.patient_contacts.push({ ...base(demoId(`contact:${i}:0`)), patientId: pid, type: 'phone', value: `09${int(10, 99)} ${int(100, 999)} ${int(1000, 9999)}`, label: child ? 'Mother' : '', isPrimary: true });
    if (r() < 0.5) out.patient_contacts.push({ ...base(demoId(`contact:${i}:1`)), patientId: pid, type: r() < 0.5 ? 'email' : 'messenger', value: r() < 0.5 ? `${handle}@gmail.com` : `m.me/${handle}`, label: '', isPrimary: false });

    // visits over the last two years
    const teethPool = child ? [...QUADRANTS.primary.upperRight, ...QUADRANTS.primary.upperLeft, ...QUADRANTS.primary.lowerLeft, ...QUADRANTS.primary.lowerRight] : [...QUADRANTS.permanent.upperRight, ...QUADRANTS.permanent.upperLeft, ...QUADRANTS.permanent.lowerLeft, ...QUADRANTS.permanent.lowerRight];
    const used = new Set<number>();
    const visits = r() < 0.12 ? 0 : int(1, 6);
    const dates = Array.from({ length: visits }, () => int(0, 720)).sort((a, b) => b - a);
    dates.forEach((ago, v) => {
      const spec = v === 0 ? PROCS[0] : pick(PROCS);
      const prId = demoId(`procedure:${i}:${v}`);
      const date = daysAgo(ago);
      const time = `${pad(int(8, 17))}:${pick(['00', '15', '30', '45'])}`;
      const costCents = int(spec.cost[0] / 50, spec.cost[1] / 50) * 5000;
      out.procedures.push({ ...base(prId), patientId: pid, type: spec.type, date, time, costCents, remarks: r() < 0.15 ? 'Follow-up in 6 months' : '' });

      // payments: most settled, some partial, some unpaid (recent ones more likely unpaid)
      const roll = r();
      const share = roll < 0.65 ? 1 : roll < 0.85 ? pick([0.3, 0.5]) : 0;
      const method: PaymentMethod = pick(['cash', 'cash', 'cash', 'e_wallet', 'e_wallet', 'bank_transfer']);
      if (share === 1 && costCents > 3000_00 && r() < 0.5) {
        // paid in two parts
        const down = Math.round(costCents / 2 / 100) * 100;
        out.payments.push({ ...base(demoId(`payment:${i}:${v}:0`)), procedureId: prId, amountCents: down, paidAt: `${date}T${time}`, method, remarks: 'Down payment' });
        out.payments.push({ ...base(demoId(`payment:${i}:${v}:1`)), procedureId: prId, amountCents: costCents - down, paidAt: `${daysAgo(Math.max(0, ago - int(7, 30)))}T${time}`, method: 'cash', remarks: '' });
      } else if (share > 0 && costCents > 0) {
        out.payments.push({ ...base(demoId(`payment:${i}:${v}:0`)), procedureId: prId, amountCents: Math.round((costCents * share) / 100) * 100, paidAt: `${date}T${time}`, method, remarks: '' });
      }

      // dental record + teeth
      const recId = demoId(`record:${i}:${v}`);
      out.dental_records.push({ ...base(recId), patientId: pid, procedureId: prId, recordedAt: `${date}T${time}`, remarks: '' });
      const entries: [number, Condition, string][] = [];
      if (spec.condition && spec.teeth) {
        const n = int(spec.teeth[0], spec.teeth[1]);
        for (let k = 0; k < n; k++) {
          const t = pick(teethPool.filter((x) => !used.has(x)));
          if (t === undefined) break;
          used.add(t);
          entries.push([t, spec.condition, '']);
        }
      } else if (spec.type === 'Check-up / Charting') {
        for (let k = int(0, 3); k > 0; k--) {
          const t = pick(teethPool.filter((x) => !used.has(x)));
          if (t !== undefined) entries.push([t, pick(['cavity', 'cavity', 'impacted', 'missing'] as Condition[]), pick(['', 'Monitor', 'Sensitive to cold'])]);
        }
      }
      entries.forEach(([tooth, condition, remarks], k) =>
        out.tooth_entries.push({ ...base(demoId(`tooth:${i}:${v}:${k}`)), recordId: recId, patientId: pid, procedureId: prId, tooth, condition, remarks }),
      );
    });
  }
  return out;
}
