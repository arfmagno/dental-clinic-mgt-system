import { beforeEach, expect, test } from 'vitest';
import { SYNC_TABLES } from '@clinic/shared';
import { db } from '../data/db';
import { seedDemo } from './demo';
import { pendingCount } from './syncEngine';

beforeEach(async () => {
  await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
  localStorage.clear();
});

test('the demo is filled once with sample data that is not waiting to sync, and shows reports', async () => {
  await seedDemo();
  const patients = await db.patients.count();
  expect(patients).toBe(60);
  expect(await db.audit_log.count()).toBeGreaterThan(60);
  expect(await pendingCount()).toBe(0);
  expect(localStorage.getItem('clinic.feature.reports')).toBe('1');

  await db.patients.limit(5).delete(); // a visitor's changes survive a reload
  await seedDemo();
  expect(await db.patients.count()).toBe(patients - 5);
});
