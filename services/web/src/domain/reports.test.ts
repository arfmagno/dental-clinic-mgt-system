import { expect, test } from 'vitest';
import type { Patient, Payment, Procedure } from '@clinic/shared';
import { buildReport, changePercent } from './reports';

const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', isDeleted: false };
const patient = (id: string, createdAt = base.createdAt, isDeleted = false) => ({ ...base, id, createdAt, isDeleted }) as Patient;
const proc = (id: string, patientId: string, date: string, type: string, costCents: number, isDeleted = false) =>
  ({ ...base, id, patientId, date, time: '09:00', type, costCents, remarks: '', isDeleted }) as Procedure;
const pay = (id: string, procedureId: string, paidAt: string, amountCents: number, method: Payment['method'] = 'cash') =>
  ({ ...base, id, procedureId, paidAt, amountCents, method, remarks: '' }) as Payment;

const today = new Date(2026, 10, 11, 15, 0); // Nov 11, 2026, local

const data = {
  patients: [patient('a', new Date(2026, 10, 2).toISOString()), patient('b'), patient('gone', base.createdAt, true)],
  procedures: [
    proc('p1', 'a', '2026-11-03', 'Cleaning', 150_000),
    proc('p2', 'a', '2026-11-10', 'Filling', 200_000),
    proc('p3', 'b', '2026-07-01', 'Extraction', 300_000), // long ago, half paid
    proc('p4', 'b', '2026-11-10', 'Cleaning', 150_000, true), // deleted
    proc('p5', 'gone', '2026-11-10', 'Crown', 900_000), // patient deleted
  ],
  payments: [
    pay('y1', 'p1', '2026-11-03T10:00', 150_000),
    pay('y2', 'p2', '2026-11-10T11:00', 50_000, 'e_wallet'),
    pay('y3', 'p3', '2026-07-01T09:30', 150_000),
    pay('y4', 'p3', '2026-10-05T09:30', 20_000), // previous 30-day period
    pay('y5', 'p4', '2026-11-10T09:30', 150_000), // of a deleted procedure
    pay('y6', 'p5', '2026-11-10T09:30', 900_000), // of a deleted patient
  ],
};

test('30-day report: totals, daily collections, top procedures, methods and balance aging', () => {
  const r = buildReport(data, '30d', today);
  expect(r).toMatchObject({ from: '2026-10-13', to: '2026-11-11', collectedCents: 200_000, previousCollectedCents: 20_000, billedCents: 350_000, procedureCount: 2, newPatients: 1 });
  expect(r.collections).toHaveLength(30);
  expect(r.collections.filter((b) => b.cents > 0).map((b) => [b.key, b.cents])).toEqual([['2026-11-03', 150_000], ['2026-11-10', 50_000]]);
  expect(r.topProcedures.map((t) => t.type)).toEqual(['Filling', 'Cleaning']); // same count: higher billed first
  expect(r.methods).toEqual([{ method: 'cash', label: 'Cash', cents: 150_000 }, { method: 'e_wallet', label: 'E-wallet (GCash, Maya…)', cents: 50_000 }]);
  // unpaid today: Filling 1,500 (1 day old), Extraction 1,300 (133 days old)
  expect(r.outstandingCents).toBe(280_000);
  expect(r.owingPatients).toBe(2);
  expect(r.aging.map((a) => [a.label, a.cents, a.count])).toEqual([['0–30 days', 150_000, 1], ['31–90 days', 0, 0], ['Over 90 days', 130_000, 1]]);
});

test('90-day report groups by week (Monday start); 12-month report by calendar month', () => {
  const w = buildReport(data, '90d', today);
  expect(new Date(`${w.collections[0].key}T00:00`).getDay()).toBe(1);
  expect(w.collections.reduce((s, b) => s + b.cents, 0)).toBe(w.collectedCents);
  expect(w.collectedCents).toBe(220_000);

  const m = buildReport(data, '12m', today);
  expect(m.collections.map((b) => b.key)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  expect(m.collections.map((b) => b.cents).slice(-5)).toEqual([150_000, 0, 0, 20_000, 200_000]);
});

test('change against the previous period', () => {
  expect(changePercent(200, 100)).toBe(100);
  expect(changePercent(50, 100)).toBe(-50);
  expect(changePercent(10, 0)).toBeNull();
});
