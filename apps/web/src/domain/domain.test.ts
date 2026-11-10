import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Condition, DentalRecord, Patient, Procedure, ToothEntry } from '@clinic/shared';
import { buildChart } from './chart.js';
import { ageOf, recordedAtOf, summarize } from './format.js';
import { matchesPatient } from './search.js';

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

test('patient summary: last visit and outstanding balance come from live procedures only', () => {
  const patient = { ...base, id: 'p', fullName: 'X', address: '', birthDate: '', occupation: '', civilStatus: '', citizenship: '', photo: '', remarks: '' } as Patient;
  const proc = (id: string, date: string, cost: number, paid: number, extra: Partial<Procedure> = {}): Procedure => ({ ...base, id, patientId: 'p', type: 't', date, time: '', costCents: cost, paidCents: paid, remarks: '', ...extra });
  const s = summarize(patient, [
    proc('1', '2026-01-01', 10000, 4000),
    proc('2', '2026-03-01', 5000, 0),
    proc('3', '2026-09-09', 99999, 0, { isDeleted: true }), // deleted: ignored
    proc('4', '2026-05-05', 100, 0, { patientId: 'other' }), // someone else's: ignored
  ]);
  assert.equal(s.lastVisit, '2026-03-01');
  assert.equal(s.balanceCents, 11000);
});

test('recordedAt combines date and time (time optional)', () => {
  assert.equal(recordedAtOf('2026-03-05', '14:30'), '2026-03-05T14:30');
  assert.equal(recordedAtOf('2026-03-05', ''), '2026-03-05T00:00');
});

test('search: every word must match name or contact values', () => {
  const p = { fullName: 'Maria Santos', address: 'Quezon City', occupation: 'Teacher' } as Patient;
  assert.equal(matchesPatient(p, ' 0917 555 0101 m.me/maria', 'maria 0917'), true);
  assert.equal(matchesPatient(p, '', 'MARIA quezon'), true);
  assert.equal(matchesPatient(p, '', 'maria pedro'), false);
  assert.equal(matchesPatient(p, '', '   '), true);
});
