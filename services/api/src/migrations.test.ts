import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SYNC_TABLES, TABLE_COLUMNS, TOOTH_CATALOG } from '@clinic/shared';
import { openDriver } from './infrastructure/db/open.js';
import { migrate } from './migrate.js';
import { checkMigrationFiles, loadMigrations, MIGRATIONS_DIR } from './migrations/index.js';
import { migrationTemplate, newMigrationFileName, toKebab, timestampOf } from './migrations/generate.js';
import type { Migration } from './migrations/types.js';
import { SyncService, TRUSTED } from './services/syncService.js';

const iso = () => new Date().toISOString();
const V1 = '20261110090000'; // baseline schema
const V2 = '20261112090000'; // staff accounts and audit trail

// ---------------- files, names and the generator (unit) ----------------
test('migration files in the repo are well named, unique and load', async () => {
  assert.deepEqual(checkMigrationFiles(await readdir(MIGRATIONS_DIR)), []);
  const list = await loadMigrations();
  assert.deepEqual(list.map((m) => m.version), [V1, V2]);
  assert.equal(list[0].name, 'initial schema');
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
  assert.deepEqual(await migrate(db), [V1, V2]);
  assert.deepEqual(await migrate(db), []);
});

test('the schema matches the shared model: every synced column, the FDI tooth catalog, foreign keys', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  for (const table of SYNC_TABLES) {
    const cols = (await db.all<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)).map((c) => c.name);
    for (const c of ['id', 'createdAt', 'updatedAt', 'isDeleted', 'serverSeq', ...TABLE_COLUMNS[table]]) assert.ok(cols.includes(c), `${table}.${c}`);
    assert.equal(cols.length, 5 + TABLE_COLUMNS[table].length, `${table} has no extra columns`);
  }
  const teeth = await db.all<{ number: number; name: string }>('SELECT number, name FROM teeth ORDER BY number');
  assert.deepEqual(teeth, [...TOOTH_CATALOG].sort((a, b) => a.number - b.number).map((t) => ({ number: t.number, name: t.name })));

  const now = iso();
  await db.run("INSERT INTO patients (id, createdAt, updatedAt, serverSeq, firstName, lastName) VALUES ('p1', ?, ?, 1, 'Ana', 'Reyes')", [now, now]);
  assert.deepEqual(await db.get('SELECT dentalClassification, addressLine1 FROM patients'), { dentalClassification: '', addressLine1: '' });
  await db.run("INSERT INTO dental_records (id, createdAt, updatedAt, serverSeq, patientId, recordedAt) VALUES ('r1', ?, ?, 2, 'p1', ?)", [now, now, now]);
  await assert.rejects(
    db.run("INSERT INTO tooth_entries (id, createdAt, updatedAt, serverSeq, recordId, patientId, tooth, condition) VALUES ('e1', ?, ?, 3, 'r1', 'p1', 19, 'filled')", [now, now]),
    /FOREIGN KEY/,
    'tooth 19 does not exist in FDI notation',
  );
});

test('a migration older than one already applied is refused', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const late: Migration = { version: '20261101000000', name: 'from an old branch', up: async () => {} };
  await assert.rejects(migrate(db, { migrations: [...(await loadMigrations()), late] }), /older than already-applied/);
});

test('a later migration can add a column and backfill it, and devices receive the backfill', async () => {
  const db = openDriver('sqlite::memory:');
  await migrate(db);
  const sync = new SyncService(db);
  await sync.push(TRUSTED, { changes: { patients: [{ id: 'p1', createdAt: iso(), updatedAt: iso(), isDeleted: false, firstName: 'Maria', lastName: 'Clara' }] } as any });
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
  assert.equal((await db.all('SELECT version FROM _migrations')).length, 2); // only the real ones
});
