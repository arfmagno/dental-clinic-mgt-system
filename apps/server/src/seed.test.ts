import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoData, SYNC_TABLES, validateColumns } from '@clinic/shared';
import { openDriver } from './infra/db/open.js';
import { migrate } from './migrate.js';
import { seedDemo, unseedDemo } from './seed.js';

test('sample data is deterministic, valid, and every child points at an existing parent', () => {
  const opts = { today: '2026-11-11', now: '2026-11-11T00:00:00.000Z' };
  const a = buildDemoData(opts);
  assert.deepEqual(buildDemoData(opts), a);
  assert.equal(a.patients.length, 60);
  const ids = new Set<string>();
  for (const t of SYNC_TABLES) {
    for (const r of a[t]) {
      assert.equal(validateColumns(t, r), null, `${t} ${r.id}`);
      assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
      ids.add(r.id);
    }
  }
  const patients = new Set(a.patients.map((p) => p.id));
  const procedures = new Map(a.procedures.map((p) => [p.id, p]));
  for (const c of a.patient_contacts) assert.ok(patients.has(c.patientId as string));
  for (const p of a.procedures) assert.ok(patients.has(p.patientId as string));
  for (const p of a.payments) assert.ok(procedures.has(p.procedureId as string));
  // never paid more than the cost
  const paid = new Map<string, number>();
  for (const p of a.payments) paid.set(p.procedureId as string, (paid.get(p.procedureId as string) ?? 0) + (p.amountCents as number));
  for (const [id, cents] of paid) assert.ok(cents <= (procedures.get(id)!.costCents as number), id);
  // every patient has exactly one primary contact, a birth date and a citizenship
  for (const p of a.patients) {
    assert.equal(a.patient_contacts.filter((c) => c.patientId === p.id && c.isPrimary).length, 1);
    assert.match(p.birthDate as string, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.citizenshipCode);
  }
  // nothing is dated in the future
  for (const p of a.procedures) assert.ok((p.date as string) <= '2026-11-11');
  for (const p of a.payments) assert.ok((p.paidAt as string).slice(0, 10) <= '2026-11-11');
});

test('seeding goes through sync, is repeatable, and can be removed', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const first = await seedDemo(db);
  assert.deepEqual(first.rejected, []);
  const count = async () => (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM patients WHERE isDeleted = 0'))!.n;
  assert.equal(await count(), 60);

  await seedDemo(db); // same ids → updates, no duplicates
  assert.equal((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM patients'))!.n, 60);

  const removed = await unseedDemo(db);
  assert.deepEqual(removed.rejected, []);
  assert.equal(await count(), 0);
  await db.close();
});
