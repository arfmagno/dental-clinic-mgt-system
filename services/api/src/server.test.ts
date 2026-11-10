import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { openDriver } from './infra/db/open.js';
import { TokenSigner } from './infra/auth/tokens.js';
import { migrate } from './migrate.js';
import { AuthService, LoginThrottle, PasswordAuthProvider } from './services/authService.js';
import { SyncService } from './services/syncService.js';
import { buildApp } from './http/app.js';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, createdAt: iso(), updatedAt: iso(), isDeleted: false, ...extra });
const patient = (id: string, extra: Record<string, unknown> = {}) => row(id, { firstName: 'Juan', lastName: 'Dela Cruz', ...extra });
const procedure = (id: string, patientId: string, extra: Record<string, unknown> = {}) =>
  row(id, { patientId, type: 'Filling', date: '2026-11-10', time: '09:00', costCents: 150000, remarks: '', ...extra });

async function setup(throttle?: LoginThrottle) {
  const config = loadConfig({ NODE_ENV: 'test', CLINIC_PASSWORD: 'pw', AUTH_SECRET: 's'.repeat(32), WEB_DIR: '' });
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const auth = new AuthService({ provider: new PasswordAuthProvider('pw'), signer: new TokenSigner(config.authSecret), tokenTtlSeconds: 3600, throttle });
  const sync = new SyncService(db);
  const app = await buildApp({ config, db, auth, sync });
  const login = async () => (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: 'pw' } })).json().token as string;
  return { app, db, sync, login };
}

// ---------------- sync rules ----------------
test('push applies parents before children, last-write-wins, pull pages by cursor', async () => {
  const { sync } = await setup();
  const res = await sync.push({ changes: { procedures: [procedure('pr1', 'p1')], patients: [patient('p1')] } as any });
  assert.deepEqual(res.rejected, []);
  assert.deepEqual(res.accepted.patients, ['p1']);

  const stale = await sync.push({ changes: { patients: [patient('p1', { firstName: 'OLD', updatedAt: iso(-60_000) })] } as any });
  assert.deepEqual(stale.stale.patients, ['p1']);

  const page1 = await sync.pull(0, 1);
  assert.equal(page1.rows.length, 1);
  assert.equal(page1.hasMore, true);
  const page2 = await sync.pull(page1.cursor, 10);
  assert.equal(page1.rows.length + page2.rows.length, 2);
  assert.equal(page2.hasMore, false);
  const fetched = [...page1.rows, ...page2.rows].find((r) => r.table === 'patients')!.row;
  assert.equal(fetched.firstName, 'Juan');
  assert.equal(fetched.isDeleted, false);
  assert.ok(!('serverSeq' in fetched));
});

test('payments sync with their parents; tables the server no longer has are ignored', async () => {
  const { sync } = await setup();
  const res = await sync.push({
    changes: {
      payments: [row('pay1', { procedureId: 'pr1', amountCents: 50000, paidAt: '2026-11-10T09:30', method: 'cash', remarks: '' })],
      patient_addresses: [row('a1', { patientId: 'p1', label: 'Home', city: 'Quezon City', countryCode: 'PH', isPrimary: true })], // from a v0.2.0 device
      procedures: [procedure('pr1', 'p1')],
      patients: [patient('p1', { addressLine1: '12 Mabini St, Quezon City', addressCountryCode: 'PH' })],
    } as any,
  });
  assert.deepEqual(res.rejected, []);
  assert.deepEqual([res.accepted.payments, (res.accepted as Record<string, unknown>).patient_addresses], [['pay1'], undefined]);
  const p = (await sync.pull(0)).rows.find((r) => r.table === 'patients')!.row;
  assert.deepEqual([p.addressLine1, p.addressCountryCode], ['12 Mabini St, Quezon City', 'PH']);
});

test('a far-future device clock is clamped, unknown columns are dropped, bad rows are rejected individually', async () => {
  const { sync, db } = await setup();
  const res = await sync.push({
    changes: {
      patients: [patient('p1', { updatedAt: iso(30 * 24 * 3600 * 1000), isAdmin: true }), { id: 'bad', createdAt: 'nope', updatedAt: iso(), isDeleted: false, firstName: 'x' }, patient('p2')],
    } as any,
  });
  assert.deepEqual(res.accepted.patients, ['p1', 'p2']);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].id, 'bad');
  const r = await db.get<{ updatedAt: string }>('SELECT updatedAt FROM patients WHERE id = ?', ['p1']);
  assert.ok(Date.parse(r!.updatedAt) < Date.now() + 11 * 60 * 1000);
});

test('vocabulary, money and tooth rules are enforced on push', async () => {
  const { sync } = await setup();
  const res = await sync.push({
    changes: {
      patients: [patient('p1'), patient('p2', { salutation: 'Lord' }), patient('p3', { citizenshipCode: 'Filipino' })],
      procedures: [procedure('pr1', 'p1'), procedure('pr2', 'p1', { costCents: -5 })],
      payments: [row('pay1', { procedureId: 'pr1', amountCents: 0, paidAt: '2026-11-10T09:30', method: 'cash' }), row('pay2', { procedureId: 'pr1', amountCents: 100, paidAt: '2026-11-10T09:30', method: 'barter' })],
      dental_records: [row('r1', { patientId: 'p1', procedureId: 'pr1', recordedAt: '2026-11-10T09:00' })],
      tooth_entries: [row('e1', { recordId: 'r1', patientId: 'p1', procedureId: 'pr1', tooth: 19, condition: 'filled' }), row('e2', { recordId: 'r1', patientId: 'p1', procedureId: 'pr1', tooth: 16, condition: 'shiny' })],
    } as any,
  });
  assert.deepEqual(res.rejected.map((r) => `${r.id}:${r.error}`).sort(), [
    'e1:invalid tooth', 'e2:invalid condition', 'p2:invalid salutation', 'p3:invalid citizenshipCode', 'pay1:invalid amountCents', 'pay2:invalid method', 'pr2:invalid costCents',
  ]);
  assert.deepEqual(res.accepted.dental_records, ['r1']);
});

test('a foreign key violation rejects that row without poisoning the rest of the push', async () => {
  const { sync } = await setup();
  const res = await sync.push({ changes: { patients: [patient('p1')], procedures: [procedure('pr1', 'missing')] } as any });
  assert.deepEqual(res.accepted.patients, ['p1']);
  assert.equal(res.rejected[0].id, 'pr1');
});

// ---------------- endpoint security ----------------
test('sync endpoints require a valid token; health and login are public', async () => {
  const { app, login } = await setup();
  assert.equal((await app.inject({ url: '/api/v1/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/v1/sync/pull' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: { changes: {} } })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: 'Bearer garbage' } })).statusCode, 401);
  const token = await login();
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${token}` } })).statusCode, 200);
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${tampered}` } })).statusCode, 401);
});

test('unknown /api paths are denied by default and responses are not cacheable', async () => {
  const { app } = await setup();
  const res = await app.inject({ url: '/api/v1/does-not-exist' });
  assert.ok([401, 403, 404].includes(res.statusCode));
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('expired tokens and roles without the permission are refused', async () => {
  const { app } = await setup();
  const signer = new TokenSigner('s'.repeat(32));
  const now = Math.floor(Date.now() / 1000);
  const call = (t: string) => app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${t}` } });
  assert.equal((await call(signer.sign({ sub: 'x', role: 'admin', iat: now - 100, exp: now - 10 }))).statusCode, 401);
  assert.equal((await call(signer.sign({ sub: 'x', role: 'patient', iat: now, exp: now + 100 }))).statusCode, 403);
  assert.equal((await call(new TokenSigner('different-secret-different-secret').sign({ sub: 'x', role: 'admin', iat: now, exp: now + 100 }))).statusCode, 401);
});

test('login rejects bad passwords, validates input, and throttles repeated failures', async () => {
  const { app } = await setup(new LoginThrottle(3));
  const attempt = (password: unknown) => app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password } as any });
  assert.equal((await attempt({ $ne: '' })).statusCode, 400);
  assert.equal((await attempt('')).statusCode, 400);
  assert.equal((await attempt('x'.repeat(201))).statusCode, 400);
  for (let i = 0; i < 3; i++) assert.equal((await attempt('wrong')).statusCode, 401);
  const locked = await attempt('pw');
  assert.equal(locked.statusCode, 429);
  assert.ok(locked.headers['retry-after']);
});

test('production refuses to start without real secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /CLINIC_PASSWORD/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', CLINIC_PASSWORD: 'x', AUTH_SECRET: 'short' }), /AUTH_SECRET/);
});
