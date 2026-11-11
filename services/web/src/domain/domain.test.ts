import { assert, test } from 'vitest';
import {
  deterministicUuid,
  formatName,
  isValidTooth,
  legacyAddressRow,
  legacyPatientPatch,
  legacyPaymentRow,
  legacyV3Address,
  nationalityOf,
  nationalityOptions,
  OTHER_PROCEDURE,
  nameGroup,
  nameSortKey,
  paidByProcedure,
  splitLegacyFullName,
  validateColumns,
  type Condition,
  type DentalRecord,
  type Patient,
  type Payment,
  type Procedure,
  type ToothEntry,
  chartsFor,
  suggestDentalClassification,
} from '@clinic/shared';
import { classificationOf } from './classification.js';
import { buildChart } from './chart.js';
import { ageOf, formatAddress, recordedAtOf, summarize } from './format.js';
import { groupStartPages, pageWindow, paginate } from './paging.js';
import { matchesPatient } from './search.js';
import { resolveProcedureType, splitProcedureType } from './procedureType.js';

const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isDeleted: false };
let n = 0;
const rec = (recordedAt: string, extra: Partial<DentalRecord> = {}): DentalRecord => ({ ...base, id: `r${++n}`, patientId: 'p', procedureId: null, recordedAt, remarks: '', createdAt: `2026-02-0${n}T00:00:00Z`, ...extra });
const entry = (recordId: string, tooth: number, condition: Condition, extra: Partial<ToothEntry> = {}): ToothEntry => ({ ...base, id: `e${++n}`, recordId, patientId: 'p', procedureId: null, tooth, condition, remarks: '', ...extra });

test('chart: the latest record wins per tooth, regardless of insertion order', () => {
  const old = rec('2026-01-10T09:00');
  const recent = rec('2026-03-05T09:00');
  // the recent record is passed first on purpose
  const chart = buildChart([recent, old], [entry(recent.id, 16, 'extracted'), entry(old.id, 16, 'cavity'), entry(old.id, 17, 'filled')]);
  assert.equal(chart.get(16)?.condition, 'extracted');
  assert.equal(chart.get(17)?.condition, 'filled');
});

test('chart: a backdated record entered later does not override a newer real record', () => {
  const newer = rec('2026-03-05T09:00', { createdAt: '2026-03-05T09:00:00Z' });
  const backdated = rec('2026-01-01T09:00', { createdAt: '2026-04-01T09:00:00Z' }); // entered last, happened first
  const chart = buildChart([newer, backdated], [entry(newer.id, 11, 'crown'), entry(backdated.id, 11, 'cavity')]);
  assert.equal(chart.get(11)?.condition, 'crown');
});

test('chart: same-day procedures are ordered by time', () => {
  const morning = rec('2026-03-05T09:00');
  const afternoon = rec('2026-03-05T15:30');
  const chart = buildChart([afternoon, morning], [entry(morning.id, 26, 'cavity'), entry(afternoon.id, 26, 'filled')]);
  assert.equal(chart.get(26)?.condition, 'filled');
});

test('chart: "as of" a record shows the history up to and including it', () => {
  const a = rec('2026-01-10T09:00');
  const b = rec('2026-02-10T09:00');
  const entries = [entry(a.id, 36, 'cavity'), entry(b.id, 36, 'filled'), entry(b.id, 37, 'missing')];
  const asOfA = buildChart([a, b], entries, a.id);
  assert.equal(asOfA.get(36)?.condition, 'cavity');
  assert.equal(asOfA.has(37), false);
  assert.equal(buildChart([a, b], entries).get(36)?.condition, 'filled');
});

test('chart: deleted records and entries are ignored', () => {
  const a = rec('2026-01-10T09:00');
  const gone = rec('2026-02-10T09:00', { isDeleted: true });
  const chart = buildChart([a, gone], [entry(a.id, 14, 'filled'), entry(gone.id, 14, 'extracted'), entry(a.id, 15, 'crown', { isDeleted: true })]);
  assert.equal(chart.get(14)?.condition, 'filled');
  assert.equal(chart.has(15), false);
});

test('age accounts for whether the birthday has passed', () => {
  const today = new Date('2026-11-10T12:00');
  assert.equal(ageOf('1990-11-10', today), 36); // birthday today
  assert.equal(ageOf('1990-11-11', today), 35); // tomorrow
  assert.equal(ageOf('', today), null);
  assert.equal(ageOf('garbage', today), null);
});

const patient = (extra: Partial<Patient> = {}): Patient => ({
  ...base, id: 'p', salutation: '', firstName: 'Maria', middleName: 'Clara', lastName: 'Santos',
  birthDate: '', occupation: 'Teacher', civilStatus: '', citizenshipCode: 'PH', addressLine1: '', addressCountryCode: '', photo: '', remarks: '', ...extra,
});
const proc = (id: string, date: string, cost: number, extra: Partial<Procedure> = {}): Procedure => ({ ...base, id, patientId: 'p', type: 't', date, time: '', costCents: cost, remarks: '', ...extra });
const pay = (procedureId: string, amountCents: number, extra: Partial<Payment> = {}): Payment => ({ ...base, id: `y${++n}`, procedureId, amountCents, paidAt: '2026-01-01T09:00', method: 'cash', remarks: '', ...extra });

test('patient summary: last visit and balance come from live procedures and live payments only', () => {
  const paid = paidByProcedure([pay('1', 3000), pay('1', 1000), pay('2', 5000, { isDeleted: true })]);
  const s = summarize(patient(), [
    proc('1', '2026-01-01', 10000),
    proc('2', '2026-03-01', 5000),
    proc('3', '2026-09-09', 99999, { isDeleted: true }), // deleted: ignored
    proc('4', '2026-05-05', 100, { patientId: 'other' }), // someone else's: ignored
  ], paid);
  assert.equal(s.lastVisit, '2026-03-01');
  assert.equal(s.balanceCents, 6000 + 5000);
  assert.equal(s.name, 'Maria Clara Santos');
});

test('recordedAt combines date and time (time optional)', () => {
  assert.equal(recordedAtOf('2026-03-05', '14:30'), '2026-03-05T14:30');
  assert.equal(recordedAtOf('2026-03-05', ''), '2026-03-05T00:00');
});

test('names: full name is derived from parts in several formats', () => {
  const p = patient({ salutation: 'Dr.' });
  assert.equal(formatName(p), 'Maria Clara Santos');
  assert.equal(formatName(p, { salutation: true }), 'Dr. Maria Clara Santos');
  assert.equal(formatName(p, { middle: 'initial' }), 'Maria C. Santos');
  assert.equal(formatName(p, { lastFirst: true, middle: 'none' }), 'Santos, Maria');
  assert.equal(formatName(patient({ middleName: '' })), 'Maria Santos');
});

test('names: grouping and sorting use the last name, ignoring case and accents', () => {
  assert.equal(nameGroup(patient({ lastName: 'Ñañez' })), 'N');
  assert.equal(nameGroup(patient({ lastName: 'élan' })), 'E');
  assert.equal(nameGroup(patient({ lastName: '1st' })), '#');
  const sorted = [patient({ lastName: 'Zamora' }), patient({ lastName: 'abad' }), patient({ lastName: 'Ábalos' })].sort((a, b) => nameSortKey(a).localeCompare(nameSortKey(b)));
  assert.deepEqual(sorted.map((p) => p.lastName), ['abad', 'Ábalos', 'Zamora']);
});

test('search: every word must match name, contacts or address text (accent-insensitive)', () => {
  const p = patient({ lastName: 'Peñaflor' });
  assert.equal(matchesPatient(p, ' 0917 555 0101 Quezon City', 'maria 0917'), true);
  assert.equal(matchesPatient(p, 'Quezon City', 'penaflor quezon'), true);
  assert.equal(matchesPatient(p, '', 'maria pedro'), false);
  assert.equal(matchesPatient(p, '', '   '), true);
});

test('address formatting shows the line, plus the country only when not PH', () => {
  assert.equal(formatAddress({ addressLine1: '12 Mabini St, Quezon City', addressCountryCode: 'PH' }), '12 Mabini St, Quezon City');
  assert.match(formatAddress({ addressLine1: '2-1 Shibuya, Tokyo', addressCountryCode: 'JP' }), /^2-1 Shibuya, Tokyo.*Japan$/);
  assert.equal(formatAddress({ addressLine1: '', addressCountryCode: '' }), '');
});

test('citizenship is stored as a country code and shown as a nationality', () => {
  assert.equal(nationalityOf('PH'), 'Filipino');
  assert.equal(nationalityOf('JP'), 'Japanese');
  assert.equal(nationalityOf('XX'), 'XX'); // unknown code from old data is still shown
  assert.deepEqual(nationalityOptions()[0], { code: 'PH', label: 'Filipino' }); // default first
  const rest = nationalityOptions().slice(1).map((o) => o.label);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b)));
});

test('procedure type: "Other" stores the typed text; reopening a typed type selects "Other"', () => {
  assert.equal(resolveProcedureType({ choice: 'Filling', other: 'ignored' }), 'Filling');
  assert.equal(resolveProcedureType({ choice: OTHER_PROCEDURE, other: '  Gum treatment ' }), 'Gum treatment');
  assert.equal(resolveProcedureType({ choice: OTHER_PROCEDURE, other: '   ' }), '');
  assert.deepEqual(splitProcedureType('Filling'), { choice: 'Filling', other: '' });
  assert.deepEqual(splitProcedureType('Gum treatment'), { choice: OTHER_PROCEDURE, other: 'Gum treatment' });
  assert.deepEqual(splitProcedureType(''), { choice: '', other: '' });
});

test('legacy v2 → v3: the primary (else oldest) live address becomes one line', () => {
  const addr = (id: string, extra: Record<string, unknown>) => ({ id, patientId: 'p', label: '', street: '', district: '', city: '', province: '', postalCode: '', countryCode: 'PH', isPrimary: false, isDeleted: false, createdAt: '2026-01-01T00:00:00Z', ...extra });
  assert.deepEqual(
    legacyV3Address([
      addr('a', { street: 'Old St', createdAt: '2025-01-01T00:00:00Z' }),
      addr('b', { street: '12 Mabini St', city: 'Quezon City', province: 'Metro Manila', postalCode: '1100', isPrimary: true }),
      addr('c', { street: 'Deleted', isPrimary: true, isDeleted: true }),
    ]),
    { addressLine1: '12 Mabini St, Quezon City, Metro Manila 1100', addressCountryCode: 'PH' },
  );
  assert.equal(legacyV3Address([addr('x', { street: 'Old St', createdAt: '2025-01-01T00:00:00Z' }), addr('y', { street: 'New St' })]).addressLine1, 'Old St');
  assert.deepEqual(legacyV3Address([]), { addressLine1: '', addressCountryCode: '' });
});

test('paging: pages are clamped and group start pages point to the first item of each letter', () => {
  const list = Array.from({ length: 60 }, (_, i) => (i < 30 ? 'A' : i < 55 ? 'B' : 'C'));
  assert.equal(paginate(list, 25, 99).page, 3);
  assert.equal(paginate(list, 25, 0).page, 1);
  assert.equal(paginate(list, 25, 3).items.length, 10);
  assert.deepEqual([...groupStartPages(list, (x) => x, 25)], [['A', 1], ['B', 2], ['C', 3]]);
  assert.deepEqual(pageWindow(6, 12), [1, '…', 5, 6, 7, '…', 12]);
  assert.deepEqual(pageWindow(1, 2), [1, 2]);
});

test('legacy v1 → v2: name split keeps surname particles with the last name', () => {
  assert.deepEqual(splitLegacyFullName('Juan Dela Cruz'), { firstName: 'Juan', middleName: '', lastName: 'Dela Cruz' });
  assert.deepEqual(splitLegacyFullName('Ana Marie de los Santos'), { firstName: 'Ana', middleName: 'Marie', lastName: 'de los Santos' });
  assert.deepEqual(splitLegacyFullName('Madonna'), { firstName: 'Madonna', middleName: '', lastName: '' });
});

test('legacy v1 → v2: citizenship becomes a code, unknown text is kept in remarks', () => {
  assert.equal(legacyPatientPatch({ id: 'x', citizenship: 'Filipino' }).citizenshipCode, 'PH');
  const odd = legacyPatientPatch({ id: 'x', citizenship: 'Martian', remarks: 'Allergic to latex' });
  assert.equal(odd.citizenshipCode, '');
  assert.equal(odd.remarks, 'Allergic to latex\nCitizenship (from earlier record): Martian');
});

test('legacy v1 → v2: address and payment rows are deterministic (device and server agree)', () => {
  const a1 = legacyAddressRow({ id: 'p1', address: '12 Mabini St' }, 'now')!;
  const a2 = legacyAddressRow({ id: 'p1', address: '12 Mabini St' }, 'later')!;
  assert.equal(a1.id, a2.id);
  assert.match(a1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(legacyAddressRow({ id: 'p1', address: '  ' }, 'now'), null);
  const y = legacyPaymentRow({ id: 'r1', date: '2026-02-01', time: '', paidCents: 1500 }, 'now')!;
  assert.equal(y.paidAt, '2026-02-01T00:00');
  assert.equal(y.amountCents, 1500);
  assert.equal(legacyPaymentRow({ id: 'r1', date: '2026-02-01', paidCents: 0 }, 'now'), null);
  assert.notEqual(deterministicUuid('a'), deterministicUuid('b'));
});

test('validation: vocabularies, money and teeth are enforced', () => {
  assert.equal(validateColumns('payments', { amountCents: 0, paidAt: '2026-01-01T09:00', method: 'cash' }), 'invalid amountCents');
  assert.equal(validateColumns('payments', { amountCents: 100, paidAt: '2026-01-01T09:00', method: 'gold' }), 'invalid method');
  assert.equal(validateColumns('patients', { salutation: 'Sir' }), 'invalid salutation');
  assert.equal(validateColumns('patients', { salutation: 'Dr.', citizenshipCode: 'PH' }), null);
  assert.equal(isValidTooth(18), true);
  assert.equal(isValidTooth(19), false);
  assert.equal(isValidTooth(55), true);
});

test('dental classification: suggested from age until the dentist chooses; charts per classification', () => {
  const today = new Date('2026-11-11T12:00');
  assert.equal(suggestDentalClassification(null), 'permanent');
  assert.equal(suggestDentalClassification(3), 'primary');
  assert.equal(suggestDentalClassification(5), 'primary');
  assert.equal(suggestDentalClassification(6), 'mixed');
  assert.equal(suggestDentalClassification(12), 'mixed');
  assert.equal(suggestDentalClassification(13), 'permanent');

  assert.deepEqual(classificationOf({ birthDate: '2022-01-01', dentalClassification: '' }, today), { value: 'primary', suggested: true });
  assert.deepEqual(classificationOf({ birthDate: '2022-01-01' }, today), { value: 'primary', suggested: true }); // rows from before 0.4.0
  assert.deepEqual(classificationOf({ birthDate: '2022-01-01', dentalClassification: 'mixed' }, today), { value: 'mixed', suggested: false });
  assert.deepEqual(classificationOf({ birthDate: '', dentalClassification: '' }, today), { value: 'permanent', suggested: true });

  assert.deepEqual(chartsFor('primary'), ['primary']);
  assert.deepEqual(chartsFor('mixed'), ['primary', 'permanent']);
  assert.deepEqual(chartsFor('permanent'), ['permanent']);

  assert.equal(validateColumns('patients', { dentalClassification: 'mixed' }), null);
  assert.equal(validateColumns('patients', { dentalClassification: '' }), null);
  assert.equal(validateColumns('patients', { dentalClassification: 'baby' }), 'invalid dentalClassification');
});

test('phone numbers: country code, flag, parsing older numbers, tel: links', async () => {
  const { DIAL_CODES, flagOf, formatPhone, parsePhone, phoneHref } = await import('@clinic/shared');
  assert.equal(DIAL_CODES.PH, '63');
  assert.equal(flagOf('PH'), '🇵🇭');
  assert.equal(formatPhone('PH', '0917 123 4567'), '+63 917 123 4567');
  assert.equal(formatPhone('PH', '  '), '');
  assert.deepEqual(parsePhone('+63 917 123 4567'), { country: 'PH', national: '917 123 4567' });
  assert.deepEqual(parsePhone('0917 123 4567'), { country: 'PH', national: '917 123 4567' }); // older rows: PH
  assert.deepEqual(parsePhone('+639171234567'), { country: 'PH', national: '9171234567' });
  assert.deepEqual(parsePhone('+1 416 555 0100'), { country: 'US', national: '416 555 0100' });
  assert.deepEqual(parsePhone('+1 416 555 0100', 'CA'), { country: 'CA', national: '416 555 0100' });
  assert.deepEqual(parsePhone('+971 50 123 4567'), { country: 'AE', national: '50 123 4567' });
  assert.equal(parsePhone('+63 917 ').national, '917 '); // spaces survive while typing
  assert.equal(phoneHref('+63 917 123 4567'), '+639171234567');
  assert.equal(phoneHref('0917-123-4567'), '+639171234567');
});

test('phone search: "0917…", digits only, or with the country code', async () => {
  const { contactSearchText } = await import('./search');
  const { emptyPatient } = await import('../services/patientService');
  const p = { ...emptyPatient(), firstName: 'Ana', lastName: 'Cruz' } as never;
  const text = contactSearchText({ type: 'phone', value: '+63 917 555 0101' });
  for (const q of ['0917 555', '09175550101', '639175550101', '+63 917', 'ana 0917']) assert.equal(matchesPatient(p, text, q), true, q);
  assert.equal(contactSearchText({ type: 'email', value: 'a@b.co' }), 'a@b.co');
});
