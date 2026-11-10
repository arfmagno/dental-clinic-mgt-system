import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { openDriver } from './infra/db/open.js';
import { TokenSigner } from './infra/auth/tokens.js';
import { migrate } from './migrate.js';
import { migrations } from './migrations/index.js';
import type { Migration } from './migrations/types.js';
import { AuthService, LoginThrottle, PasswordAuthProvider } from './services/authService.js';
import { SyncService } from './services/syncService.js';
import { buildApp } from './http/app.js';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const patient = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt: iso(),
  updatedAt: iso(),
  isDeleted: false,
  fullName: 'Juan Dela Cruz',
  ...extra,
});

async function setup(throttle?: LoginThrottle) {
  const config = loadConfig({ NODE_ENV: 'test', CLINIC_PASSWORD: 'pw', AUTH_SECRET: 's'.repeat(32), WEB_DIR: '' });
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const auth = new AuthService({
    provider: new PasswordAuthProvider('pw'),
    signer: new TokenSigner(config.authSecret),
    tokenTtlSeconds: 3600,
    throttle,
  });
  const sync = new SyncService(db);
  const app = await buildApp({ config, db, auth, sync });
  const login = async () =>
    (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: 'pw' } })).json().token as string;
  return { app, db, sync, login };
}

// ---------------- migrations ----------------
test('migrations apply once and are idempotent', async () => {
  const db = openDriver('sqlite::memory:');
  assert.deepEqual(await migrate(db), [1]);
  assert.deepEqual(await migrate(db), []);
});

test('a later migration can add a column and backfill it, and devices receive the backfill', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const sync = new SyncService(db);
  await sync.push({ changes: { patients: [patient('p1', { fullName: 'Maria Clara' })] } as any });
  const before = (await sync.pull(0)).cursor;

  const m002: Migration = {
    id: 2,
    name: 'add patients.nickname',
    async up(ctx) {
      await ctx.db.exec("ALTER TABLE patients ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
      await ctx.backfill('patients', (row) => ({ nickname: String(row.fullName).split(' ')[0] }), "nickname = ''");
    },
  };
  assert.deepEqual(await migrate(db, { migrations: [...migrations, m002] }), [2]);

  const row = await db.get<{ nickname: string; serverSeq: number }>('SELECT nickname, serverSeq FROM patients WHERE id = ?', ['p1']);
  assert.equal(row?.nickname, 'Maria');
  assert.ok(row!.serverSeq > before, 'backfilled row must get a new serverSeq so clients pull it');
});

test('a failing migration rolls back completely and is not recorded', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const bad: Migration = {
    id: 2,
    name: 'broken',
    async up(ctx) {
      await ctx.db.exec('CREATE TABLE half_done (id TEXT)');
      throw new Error('boom');
    },
  };
  await assert.rejects(migrate(db, { migrations: [...migrations, bad] }), /boom/);
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'"), undefined);
  assert.equal((await db.all('SELECT id FROM _migrations')).length, 1);
});

// ---------------- sync rules ----------------
test('push applies parents before children, last-write-wins, pull pages by cursor', async () => {
  const { sync } = await setup();
  const proc = { id: 'pr1', createdAt: iso(), updatedAt: iso(), isDeleted: false, patientId: 'p1', type: 'Filling', date: '2026-11-10', time: '09:00', costCents: 150000, paidCents: 0, remarks: '' };
  // child listed in the payload, parent too: tables are processed in dependency order regardless
  const res = await sync.push({ changes: { procedures: [proc], patients: [patient('p1')] } as any });
  assert.deepEqual(res.rejected, []);
  assert.deepEqual(res.accepted.patients, ['p1']);

  const older = patient('p1', { fullName: 'OLD', updatedAt: iso(-60_000) });
  const stale = await sync.push({ changes: { patients: [older] } as any });
  assert.deepEqual(stale.stale.patients, ['p1']);

  const page1 = await sync.pull(0, 1);
  assert.equal(page1.rows.length, 1);
  assert.equal(page1.hasMore, true);
  const page2 = await sync.pull(page1.cursor, 10);
  assert.equal(page1.rows.length + page2.rows.length, 2);
  assert.equal(page2.hasMore, false);
  const fetched = [...page1.rows, ...page2.rows].find((r) => r.table === 'patients')!.row;
  assert.equal(fetched.fullName, 'Juan Dela Cruz');
  assert.equal(fetched.isDeleted, false);
  assert.ok(!('serverSeq' in fetched));
});

test('a far-future device clock is clamped, unknown columns are dropped, bad rows are rejected individually', async () => {
  const { sync, db } = await setup();
  const res = await sync.push({
    changes: {
      patients: [
        patient('p1', { updatedAt: iso(30 * 24 * 3600 * 1000), isAdmin: true }),
        { id: 'bad', createdAt: 'nope', updatedAt: iso(), isDeleted: false, fullName: 'x' },
        patient('p2'),
      ],
    } as any,
  });
  assert.deepEqual(res.accepted.patients, ['p1', 'p2']);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].id, 'bad');
  const row = await db.get<{ updatedAt: string }>('SELECT updatedAt FROM patients WHERE id = ?', ['p1']);
  assert.ok(Date.parse(row!.updatedAt) < Date.now() + 11 * 60 * 1000);
});

test('a foreign key violation rejects that row without poisoning the rest of the push', async () => {
  const { sync } = await setup();
  const orphan = { id: 'pr1', createdAt: iso(), updatedAt: iso(), isDeleted: false, patientId: 'missing', type: 'x', date: '2026-01-01', time: '', costCents: 0, paidCents: 0, remarks: '' };
  const res = await sync.push({ changes: { patients: [patient('p1')], procedures: [orphan] } as any });
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
  const ok = await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${token}` } });
  assert.equal(ok.statusCode, 200);

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
  const expired = signer.sign({ sub: 'x', role: 'admin', iat: now - 100, exp: now - 10 });
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${expired}` } })).statusCode, 401);
  const patientRole = signer.sign({ sub: 'x', role: 'patient', iat: now, exp: now + 100 });
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${patientRole}` } })).statusCode, 403);
  const forged = new TokenSigner('different-secret-different-secret').sign({ sub: 'x', role: 'admin', iat: now, exp: now + 100 });
  assert.equal((await app.inject({ url: '/api/v1/sync/pull', headers: { authorization: `Bearer ${forged}` } })).statusCode, 401);
});

test('login rejects bad passwords, validates input, and throttles repeated failures', async () => {
  const { app } = await setup(new LoginThrottle(3));
  const attempt = (password: unknown) => app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password } as any });
  assert.equal((await attempt({ $ne: '' })).statusCode, 400); // not a string: rejected before reaching auth
  assert.equal((await attempt('')).statusCode, 400);
  assert.equal((await attempt('x'.repeat(201))).statusCode, 400);
  for (let i = 0; i < 3; i++) assert.equal((await attempt('wrong')).statusCode, 401);
  const locked = await attempt('pw'); // even the right password is refused while locked out
  assert.equal(locked.statusCode, 429);
  assert.ok(locked.headers['retry-after']);
});

test('production refuses to start without real secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /CLINIC_PASSWORD/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', CLINIC_PASSWORD: 'x', AUTH_SECRET: 'short' }), /AUTH_SECRET/);
});
