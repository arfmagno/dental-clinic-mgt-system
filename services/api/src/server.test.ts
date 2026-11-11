import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { openDriver } from './infrastructure/db/open.js';
import { TokenSigner } from './infrastructure/auth/tokens.js';
import { migrate } from './migrate.js';
import { AuthService, LoginThrottle, PasswordAuthProvider } from './services/authService.js';
import { SyncService, TRUSTED } from './services/syncService.js';
import { SyncRepository } from './repositories/syncRepository.js';
import type { Principal } from './domain/authorization.js';
import type { StaffRecord } from './services/authService.js';
import { buildApp } from './http/app.js';

const DEVICE: Principal = { id: 'clinic', role: 'staff', kind: 'device' };
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, createdAt: iso(), updatedAt: iso(), isDeleted: false, ...extra });
const patient = (id: string, extra: Record<string, unknown> = {}) => row(id, { firstName: 'Juan', lastName: 'Dela Cruz', ...extra });
const procedure = (id: string, patientId: string, extra: Record<string, unknown> = {}) =>
  row(id, { patientId, type: 'Filling', date: '2026-11-10', time: '09:00', costCents: 150000, remarks: '', ...extra });

async function setup(throttle?: LoginThrottle) {
  const config = loadConfig({ NODE_ENV: 'test', CLINIC_PASSWORD: 'pw', AUTH_SECRET: 's'.repeat(32), WEB_DIR: '' });
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const auth = new AuthService({ provider: new PasswordAuthProvider('pw'), signer: new TokenSigner(config.authSecret), tokenTtlSeconds: 3600, throttle, findStaff: async (id) => (await new SyncRepository(db).get('staff', id)) as StaffRecord | undefined });
  const sync = new SyncService(db);
  const app = await buildApp({ config, db, auth, sync });
  const login = async () => (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: 'pw' } })).json().token as string;
  return { app, db, sync, login };
}

// ---------------- sync rules ----------------
test('push applies parents before children, last-write-wins, pull pages by cursor', async () => {
  const { sync } = await setup();
  const res = await sync.push(DEVICE, { changes: { procedures: [procedure('pr1', 'p1')], patients: [patient('p1')] } as any });
  assert.deepEqual(res.rejected, []);
  assert.deepEqual(res.accepted.patients, ['p1']);

  const stale = await sync.push(DEVICE, { changes: { patients: [patient('p1', { firstName: 'OLD', updatedAt: iso(-60_000) })] } as any });
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
  const res = await sync.push(DEVICE, {
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
  const res = await sync.push(DEVICE, {
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
  const res = await sync.push(DEVICE, {
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

test('free text is checked too: type, length, required names, no control characters; photos must be images', async () => {
  const { sync } = await setup();
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const res = await sync.push(DEVICE, {
    changes: {
      patients: [
        patient('ok', { remarks: 'Line one\nline two', photo: jpeg }),
        patient('long', { remarks: 'x'.repeat(2001) }),
        patient('blank', { lastName: '   ' }),
        patient('typed', { firstName: { $gt: '' } }),
        patient('nul', { addressLine1: 'Main St\u0000' }),
        patient('script', { photo: 'javascript:alert(1)' }),
        patient('svg', { photo: 'data:image/svg+xml;base64,PHN2Zz4=' }),
      ],
      patient_contacts: [row('c1', { patientId: 'ok', type: 'phone', value: '', label: '', isPrimary: true })],
    } as any,
  });
  assert.deepEqual(res.accepted.patients, ['ok']);
  assert.deepEqual(res.rejected.map((r) => `${r.id}:${r.error}`).sort(), [
    'blank:invalid lastName', 'c1:invalid value', 'long:invalid remarks', 'nul:invalid addressLine1', 'script:invalid photo', 'svg:invalid photo', 'typed:invalid firstName',
  ]);
});

test('the push envelope only takes the synced tables, as lists of bounded size', async () => {
  const { app, login } = await setup();
  const token = await login();
  const push = (changes: unknown) => app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { authorization: `Bearer ${token}` }, payload: { changes } });
  const unknown = await push({ users: [{ id: 'u1' }] }); // not a synced table: dropped by the schema, never stored
  assert.equal(unknown.statusCode, 200);
  assert.deepEqual(unknown.json().accepted, {});
  assert.equal((await push({ patients: 'all' })).statusCode, 400);
  assert.equal((await push({ patients: Array.from({ length: 1001 }, (_, i) => patient(`p${i}`)) })).statusCode, 400);
  assert.equal((await push({ patients: [patient('p1')] })).statusCode, 200);
});

test('a foreign key violation rejects that row without poisoning the rest of the push', async () => {
  const { sync } = await setup();
  const res = await sync.push(DEVICE, { changes: { patients: [patient('p1')], procedures: [procedure('pr1', 'missing')] } as any });
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

// ---------------- staff accounts and the audit trail (security) ----------------
const ITER = 100_000;
async function staffRow(id: string, name: string, role: 'admin' | 'staff', pin: string, extra: Record<string, unknown> = {}) {
  const { pbkdf2Sync, randomBytes } = await import('node:crypto');
  const salt = randomBytes(16);
  return row(id, { name, role, pinSalt: salt.toString('base64'), pinHash: pbkdf2Sync(pin, salt, ITER, 32, 'sha256').toString('base64'), pinIterations: ITER, ...extra });
}
const audit = (id: string, actor: string, extra: Record<string, unknown> = {}) => row(id, { actor, action: 'added', entity: 'patients', entityId: 'p1', patientId: 'p1', ...extra });

test('staff sign-in: needs a clinic token first, then the PIN of an active account; one answer for every failure', async () => {
  const { app, sync, login } = await setup();
  await sync.push(TRUSTED, { changes: { staff: [await staffRow('s1', 'Dr. Ana', 'admin', '1234'), await staffRow('s2', 'Gone', 'staff', '5555', { isDeleted: true })] } as any });
  const staffLogin = (payload: object, token?: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/staff', payload, headers: token ? { authorization: `Bearer ${token}` } : {} });

  assert.equal((await staffLogin({ staffId: 's1', pin: '1234' })).statusCode, 401); // no clinic token
  const device = await login();
  assert.equal((await staffLogin({ staffId: 's1', pin: '12' }, device)).statusCode, 400); // not a PIN
  for (const bad of [{ staffId: 's1', pin: '9999' }, { staffId: 'nobody', pin: '1234' }, { staffId: 's2', pin: '5555' }]) {
    const res = await staffLogin(bad, device);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'Invalid credentials' });
  }
  const ok = await staffLogin({ staffId: 's1', pin: '1234' }, device);
  assert.equal(ok.statusCode, 200);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${ok.json().token}` } });
  assert.deepEqual(me.json(), { id: 's1', role: 'admin', kind: 'staff' });
});

test('staff accounts: the first one is free, then only an admin signed in with their PIN changes them', async () => {
  const { sync } = await setup();
  const first = await staffRow('a1', 'Dr. Ana', 'admin', '1234');
  assert.deepEqual((await sync.push(DEVICE, { changes: { staff: [first] } as any })).accepted, { staff: ['a1'] }); // bootstrap

  const intruder = await staffRow('x1', 'Intruder', 'admin', '0000');
  const byDevice = await sync.push(DEVICE, { changes: { staff: [intruder] } as any });
  assert.match(byDevice.rejected[0].error, /admin signed in/);

  const admin: Principal = { id: 'a1', role: 'admin', kind: 'staff' };
  const desk = await staffRow('d1', 'Bea', 'staff', '5678');
  assert.deepEqual((await sync.push(admin, { changes: { staff: [desk] } as any })).accepted, { staff: ['d1'] });

  // a staff member may change their own PIN, nothing else, and nobody else's account
  const bea: Principal = { id: 'd1', role: 'staff', kind: 'staff' };
  const newPin = { ...(await staffRow('d1', 'Bea', 'staff', '2468')), createdAt: desk.createdAt, updatedAt: iso(1000) };
  assert.deepEqual((await sync.push(bea, { changes: { staff: [newPin] } as any })).accepted, { staff: ['d1'] });
  const promote = { ...newPin, role: 'admin', updatedAt: iso(2000) };
  assert.match((await sync.push(bea, { changes: { staff: [promote] } as any })).rejected[0].error, /Only an admin/);
  assert.match((await sync.push(bea, { changes: { staff: [{ ...first, name: 'Hacked', updatedAt: iso(3000) }] } as any })).rejected[0].error, /Only an admin/);

  // the role comes from the server's copy of the account, not the token: a demoted admin loses it
  await sync.push(TRUSTED, { changes: { staff: [{ ...first, role: 'staff', updatedAt: iso(4000) }] } as any });
  assert.equal((await sync.push(admin, { changes: { staff: [intruder] } as any })).rejected.length, 1);
});

test('the audit trail is append-only on the server', async () => {
  const { sync } = await setup();
  await sync.push(DEVICE, { changes: { patients: [patient('p1')], audit_log: [audit('e1', 'a1')] } as any });
  const rewrite = await sync.push(DEVICE, { changes: { audit_log: [audit('e1', 'someone-else', { updatedAt: iso(60_000) })] } as any });
  assert.deepEqual(rewrite.stale, { audit_log: ['e1'] });
  const rows = (await sync.pull(0)).rows.filter((r) => r.table === 'audit_log');
  assert.deepEqual(rows.map((r) => r.row.actor), ['a1']);
});

test('server operator can reset a locked-out admin PIN; the account then signs in with it', async () => {
  const { app, db, sync, login } = await setup();
  await sync.push(TRUSTED, { changes: { staff: [await staffRow('a1', 'Dr. Ana', 'admin', '1234')] } as any });
  const { resetStaffPin } = await import('./staffAdmin.js');
  await assert.rejects(resetStaffPin(db, 'Nobody', '1111'), /No active staff account/);
  await assert.rejects(resetStaffPin(db, 'dr. ana', '12'), /4 to 6 digits/);
  assert.deepEqual(await resetStaffPin(db, 'dr. ana', '8642'), { id: 'a1', name: 'Dr. Ana', role: 'admin' });
  const device = await login();
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/staff', payload: { staffId: 'a1', pin: '8642' }, headers: { authorization: `Bearer ${device}` } });
  assert.equal(res.statusCode, 200);
  assert.ok((await sync.pull(0)).rows.some((r) => r.table === 'staff' && r.row.pinIterations === 210_000), 'devices receive the new PIN');
});
