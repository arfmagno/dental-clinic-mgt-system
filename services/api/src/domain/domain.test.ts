// Unit tests for the pure domain model: no database, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, isRole } from './authorization.js';
import { ValidationError } from './errors.js';
import { MAX_CLOCK_SKEW_MS, acceptIncomingRow } from './syncRow.js';

const now = new Date('2026-11-10T08:00:00.000Z');
const procedure = (extra: Record<string, unknown> = {}) => ({
  id: 'pr1',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  isDeleted: false,
  patientId: 'p1',
  type: 'Filling',
  date: '2026-11-10',
  time: '09:00',
  costCents: 150000,
  remarks: '',
  ...extra,
});

test('authorization: staff and admin can sync, patients cannot', () => {
  assert.equal(can({ id: 'a', role: 'admin' }, 'sync:push'), true);
  assert.equal(can({ id: 's', role: 'staff' }, 'sync:pull'), true);
  assert.equal(can({ id: 'p', role: 'patient' }, 'sync:pull'), false);
});

test('authorization: isRole only accepts known roles', () => {
  assert.equal(isRole('staff'), true);
  assert.equal(isRole('root'), false);
  assert.equal(isRole('toString'), false);
  assert.equal(isRole(undefined), false);
});

test('acceptIncomingRow keeps known columns and drops unknown ones', () => {
  const row = acceptIncomingRow('procedures', procedure({ hacked: true, serverSeq: 99 }), now);
  assert.equal(row.id, 'pr1');
  assert.equal((row as Record<string, unknown>).type, 'Filling');
  assert.equal('hacked' in row, false);
  assert.equal('serverSeq' in row, false);
});

test('acceptIncomingRow rejects malformed envelopes and invalid values', () => {
  const bad: Record<string, unknown>[] = [
    procedure({ id: '' }),
    procedure({ id: 'x'.repeat(65) }),
    procedure({ updatedAt: 'not a date' }),
    procedure({ isDeleted: 'no' }),
    procedure({ costCents: -1 }),
  ];
  for (const raw of bad) {
    assert.throws(() => acceptIncomingRow('procedures', raw as never, now), ValidationError, JSON.stringify(raw));
  }
});

test('acceptIncomingRow clamps a clock that runs too far ahead', () => {
  const future = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const row = acceptIncomingRow('procedures', procedure({ updatedAt: future }), now);
  assert.equal(row.updatedAt, new Date(now.getTime() + MAX_CLOCK_SKEW_MS).toISOString());

  const slightlyAhead = new Date(now.getTime() + 60_000).toISOString();
  assert.equal(acceptIncomingRow('procedures', procedure({ updatedAt: slightlyAhead }), now).updatedAt, slightlyAhead);
});
