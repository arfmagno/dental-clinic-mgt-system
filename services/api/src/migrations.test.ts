import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deterministicUuid } from '@clinic/shared';
import { openDriver } from './infrastructure/db/open.js';
import { migrate } from './migrate.js';
import { checkMigrationFiles, loadMigrations, MIGRATIONS_DIR } from './migrations/index.js';
import { migrationTemplate, newMigrationFileName, toKebab, timestampOf } from './migrations/generate.js';
import type { Migration } from './migrations/types.js';
import { SyncService } from './services/syncService.js';

const iso = () => new Date().toISOString();
const V1 = '20261110090000';
const V2 = '20261110120000';
const V3 = '20261111090000';
const upTo = async (version: string) => (await loadMigrations()).filter((m) => m.version <= version);

// ---------------- files, names and the generator (unit) ----------------
test('migration files in the repo are well named, unique and load', async () => {
  assert.deepEqual(checkMigrationFiles(await readdir(MIGRATIONS_DIR)), []);
  const list = await loadMigrations();
  assert.deepEqual(list.map((m) => m.version), [V1, V2, V3]);
  assert.deepEqual(list.map((m) => m.file?.split('.').pop()), ['sql', 'ts', 'ts']);
  assert.equal(list[2].name, 'single address');
});

test('bad file names, impossible timestamps and duplicate versions are reported', () => {
  const problems = checkMigrationFiles([
    'index.ts',
    '20261111090000-ok.sql',
    '20261111090000-same-version.ts',
    '2026-11-11-add-thing.sql',
    '20261399000000-bad-month.sql',
    '20261111100000-Not_Kebab.sql',
  ]).map((p) => p.file);
  assert.deepEqual(problems, ['20261111090000-same-version.ts', '2026-11-11-add-thing.sql', '20261399000000-bad-month.sql', '20261111100000-Not_Kebab.sql']);
});

test('generator: kebab-case description, UTC timestamp, always newer than existing files', () => {
  assert.equal(toKebab('Add patient nickname'), 'add-patient-nickname');
  assert.equal(toKebab('add_patientNickname!!'), 'add-patient-nickname');
  assert.equal(toKebab('Ñame  fix'), 'name-fix');
  const now = new Date(Date.UTC(2026, 10, 11, 8, 5, 3));
  assert.equal(timestampOf(now), '20261111080503');
  assert.equal(newMigrationFileName('add nickname', 'sql', [], now), '20261111080503-add-nickname.sql');
  // a slow clock still produces a newer version than what already exists
  assert.equal(newMigrationFileName('x', 'ts', ['20261111090000-single-address.ts'], now), '20261111090001-x.ts');
  assert.throws(() => newMigrationFileName('  !! ', 'sql', [], now), /description/);
  assert.match(migrationTemplate('ts', 'x'), /export async function up\(ctx: MigrationContext\)/);
  assert.match(migrationTemplate('sql', 'x'), /^-- x/);
});

test('loader runs .sql and .ts files from a folder, in version order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
  try {
    await writeFile(path.join(dir, '20260101000001-second.ts'), "export async function up(ctx) { await ctx.db.exec(\"INSERT INTO t VALUES ('ts')\"); }\n");
    await writeFile(path.join(dir, '20260101000000-first.sql'), '-- creates t\nCREATE TABLE t (v TEXT);\n');
    const list = await loadMigrations(dir);
    assert.deepEqual(list.map((m) => m.name), ['first', 'second']);
    const db = openDriver('sqlite::memory:');
    assert.deepEqual(await migrate(db, { migrations: list }), ['20260101000000', '20260101000001']);
    assert.deepEqual(await db.all('SELECT v FROM t'), [{ v: 'ts' }]);
    await writeFile(path.join(dir, 'oops.sql'), '');
    await assert.rejects(loadMigrations(dir), /oops\.sql/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------- runner (integration, real SQLite) ----------------
test('migrations apply once and are idempotent', async () => {
  const db = openDriver('sqlite::memory:');
  assert.deepEqual(await migrate(db), [V1, V2, V3]);
  assert.deepEqual(await migrate(db), []);
});

test('databases from before timestamped names (integer ids) are recognised', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db, { migrations: await upTo(V2) });
  // rewrite the bookkeeping to the old v0.2.0 shape
  await db.exec(`DROP TABLE _migrations;
    CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL);
    INSERT INTO _migrations VALUES (1, 'initial schema', '2026-11-10T00:00:00Z'), (2, 'normalise', '2026-11-10T00:00:00Z');`);
  assert.deepEqual(await migrate(db), [V3], 'only the new migration runs');
  assert.deepEqual((await db.all<{ version: string }>('SELECT version FROM _migrations ORDER BY version')).map((r) => r.version), [V1, V2, V3]);
});

test('a migration older than one already applied is refused', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const late: Migration = { version: '20261110100000', name: 'from an old branch', up: async () => {} };
  await assert.rejects(migrate(db, { migrations: [...(await loadMigrations()), late] }), /older than already-applied/);
});

test('a later migration can add a column and backfill it, and devices receive the backfill', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const sync = new SyncService(db);
  await sync.push({ changes: { patients: [{ id: 'p1', createdAt: iso(), updatedAt: iso(), isDeleted: false, firstName: 'Maria', lastName: 'Clara' }] } as any });
  const before = (await sync.pull(0)).cursor;

  const m: Migration = {
    version: '20991231000000',
    name: 'add nickname',
    async up(ctx) {
      await ctx.db.exec("ALTER TABLE patients ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
      await ctx.backfill('patients', (r) => ({ nickname: String(r.firstName).slice(0, 3) }), 'nickname = ?', ['']);
    },
  };
  assert.deepEqual(await migrate(db, { migrations: [...(await loadMigrations()), m] }), ['20991231000000']);
  const r = await db.get<{ nickname: string; serverSeq: number }>('SELECT nickname, serverSeq FROM patients WHERE id = ?', ['p1']);
  assert.equal(r?.nickname, 'Mar');
  assert.ok(r!.serverSeq > before, 'backfilled row must get a new serverSeq so clients pull it');
});

test('a failing migration rolls back completely and is not recorded', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const bad: Migration = {
    version: '20991231000000',
    name: 'broken',
    async up(ctx) {
      await ctx.db.exec('CREATE TABLE half_done (id TEXT)');
      throw new Error('boom');
    },
  };
  await assert.rejects(migrate(db, { migrations: [...(await loadMigrations()), bad] }), /boom/);
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'"), undefined);
  assert.equal((await db.all('SELECT version FROM _migrations')).length, 3);
});

test('normalize-patients (v1 → v2): names, citizenship, addresses, payments, tooth FK', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db, { migrations: await upTo(V1) }); // a v0.1.0 database
  const now = iso();
  await db.run(
    `INSERT INTO patients (id, createdAt, updatedAt, isDeleted, serverSeq, fullName, address, citizenship, remarks)
     VALUES ('p1', ?, ?, 0, 1, 'Juan Miguel Dela Cruz', '12 Mabini St, Quezon City', 'Filipino', ''),
            ('p2', ?, ?, 0, 2, 'Ana', '', 'Martian', 'VIP')`,
    [now, now, now, now],
  );
  await db.run(
    `INSERT INTO procedures (id, createdAt, updatedAt, isDeleted, serverSeq, patientId, type, date, time, costCents, paidCents)
     VALUES ('pr1', ?, ?, 0, 3, 'p1', 'Filling', '2026-01-05', '10:30', 150000, 50000),
            ('pr2', ?, ?, 0, 4, 'p1', 'Check-up', '2026-02-01', '', 0, 0)`,
    [now, now, now, now],
  );
  await db.run(`INSERT INTO dental_records (id, createdAt, updatedAt, isDeleted, serverSeq, patientId, procedureId, recordedAt) VALUES ('r1', ?, ?, 0, 5, 'p1', 'pr1', '2026-01-05T10:30')`, [now, now]);
  await db.run(`INSERT INTO tooth_entries (id, createdAt, updatedAt, isDeleted, serverSeq, recordId, patientId, procedureId, tooth, condition) VALUES ('e1', ?, ?, 0, 6, 'r1', 'p1', 'pr1', 16, 'filled')`, [now, now]);
  await db.exec("UPDATE sync_meta SET value = 6 WHERE key = 'seq'");

  assert.deepEqual(await migrate(db, { migrations: await upTo(V2) }), [V2]);

  const p1 = await db.get<Record<string, unknown>>('SELECT * FROM patients WHERE id = ?', ['p1']);
  assert.deepEqual([p1?.firstName, p1?.middleName, p1?.lastName, p1?.citizenshipCode], ['Juan', 'Miguel', 'Dela Cruz', 'PH']);
  assert.ok(!('fullName' in p1!) && !('address' in p1!) && !('citizenship' in p1!), 'old columns dropped');
  const p2 = await db.get<Record<string, unknown>>('SELECT * FROM patients WHERE id = ?', ['p2']);
  assert.equal(p2?.citizenshipCode, '');
  assert.match(String(p2?.remarks), /VIP\nCitizenship \(from earlier record\): Martian/, 'unrecognised citizenship is not lost');

  const addresses = await db.all<Record<string, unknown>>('SELECT * FROM patient_addresses');
  assert.equal(addresses.length, 1, 'only patients with an address get one');
  assert.equal(addresses[0].id, deterministicUuid('v2-address:p1'), 'ids are deterministic so the device upgrade matches');

  const payments = await db.all<Record<string, unknown>>('SELECT * FROM payments');
  assert.equal(payments.length, 1, 'zero amounts produce no payment');
  assert.deepEqual([payments[0].procedureId, payments[0].amountCents, payments[0].paidAt], ['pr1', 50000, '2026-01-05T10:30']);

  assert.equal((await db.all('SELECT * FROM tooth_entries')).length, 1, 'tooth entries survive the table rebuild');
  await assert.rejects(
    db.run(`INSERT INTO tooth_entries (id, createdAt, updatedAt, isDeleted, serverSeq, recordId, patientId, tooth, condition) VALUES ('e2', ?, ?, 0, 99, 'r1', 'p1', 19, 'filled')`, [now, now]),
    /FOREIGN KEY/,
    'tooth 19 does not exist in FDI notation',
  );
  assert.equal((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM teeth'))?.n, 52);
  const pulled = await new SyncService(db).pull(6, 100);
  assert.ok(new Set(pulled.rows.map((r) => r.table)).has('payments'), 'new rows are pulled by devices');
});

test('single-address (v2 → v3): primary address folded into the patient, table dropped', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db, { migrations: await upTo(V2) });
  const now = iso();
  const base = (id: string) => [id, now, now];
  for (const id of ['p1', 'p2', 'p3']) await db.run("INSERT INTO patients (id, createdAt, updatedAt, serverSeq, firstName, lastName) VALUES (?, ?, ?, 1, 'A', 'B')", base(id));
  const addr = (id: string, patientId: string, f: string, isPrimary: number, isDeleted = 0, createdAt = now) =>
    db.run(
      `INSERT INTO patient_addresses (id, createdAt, updatedAt, isDeleted, serverSeq, patientId, street, district, city, province, postalCode, countryCode, isPrimary)
       VALUES (?, ?, ?, ?, 2, ?, ?, 'Brgy. 1', 'Quezon City', 'Metro Manila', '1100', ?, ?)`,
      [id, createdAt, now, isDeleted, patientId, f, f === 'Tokyo' ? 'JP' : 'PH', isPrimary],
    );
  await addr('a1', 'p1', '12 Mabini St', 0, 0, '2026-01-01T00:00:00Z');
  await addr('a2', 'p1', 'Tokyo', 1); // primary wins
  await addr('a3', 'p2', 'Gone St', 1, 1); // deleted only → no address
  await db.exec("UPDATE sync_meta SET value = 2 WHERE key = 'seq'");

  assert.deepEqual(await migrate(db), [V3]);
  const rows = await db.all<Record<string, any>>('SELECT id, addressLine1, addressCountryCode, serverSeq FROM patients ORDER BY id');
  assert.deepEqual(rows.map((r) => [r.addressLine1, r.addressCountryCode]), [
    ['Tokyo, Brgy. 1, Quezon City, Metro Manila 1100', 'JP'],
    ['', ''],
    ['', ''],
  ]);
  assert.ok(rows[0].serverSeq > 2, 'changed patient is re-pulled by devices');
  assert.equal(rows[1].serverSeq, 1, 'unchanged patients are not re-stamped');
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name = 'patient_addresses'"), undefined);
});
