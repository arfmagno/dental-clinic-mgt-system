# Migrations: changing the schema safely

The server schema is owned by **versioned migration files** in `services/api/src/migrations/`. They run automatically on startup (and with `npm run migrate -w @clinic/server`), in order, once each.

**Baseline.** Everything up to and including 0.3.0 is collapsed into one file, `20261110090000-initial-schema.sql`, the whole current schema plus the FDI tooth catalog. The step-by-step migrations and device upgrades from 0.1.0 and 0.2.0 were removed before any real clinic data existed. Every later change is a new file on top of it.

## File names

```
<version>-<description>.<sql|ts>
20261112083000-add-patient-allergies.sql
└─ UTC timestamp YYYYMMDDHHmmss   └─ kebab-case, what it does
```

- This is the convention used by Rails, Knex, Sequelize and Prisma. Timestamps sort in creation order and do not collide when two people add migrations on different branches; sequential numbers like `003` do.
- **Use `.sql`** for schema changes (`CREATE TABLE`, `ADD COLUMN`, indexes). The file runs as-is in one transaction.
- **Use `.ts`** only when code is needed, for example to move data, backfill synced rows so devices receive them, or share a transform with the device. It must export `up(ctx)`.
- `npm run lint` checks every name (valid timestamp, kebab-case description, no duplicate versions) and that `.sql` files are not empty.

### Create one

```bash
npm run migration:new -- add patient allergies          # → 20261112083000-add-patient-allergies.sql
npm run migration:new -- split payment remarks --ts     # → …-split-payment-remarks.ts
```

The generator uses the current UTC time. It always picks a version newer than the latest existing one, so a new file can never sort before a migration that has already run. The template reminds you of the rules below.

## What the runner guarantees

- Each migration runs in **its own transaction together with its bookkeeping row** (`_migrations(version, name, appliedAt)`). If anything throws, the database is exactly as it was and the migration is not recorded.
- Before applying anything to a database that already has data, it takes a **snapshot** (`VACUUM INTO`) in `BACKUP_DIR` (default `data/backups`), named `pre-migration-<version>`.
- Foreign-key enforcement is suspended during the run (so SQLite table rebuilds are possible) and **verified after every migration**; violations abort it.
- A pending migration **older than one already applied** is refused, with a message. This happens when a branch merged a migration with an older timestamp. Rename it with a new timestamp; never reorder history.
- `ctx.backfill(table, set, where?, params?)` updates rows **and** assigns each a new `serverSeq` and `updatedAt`, so every device pulls the backfilled data on its next sync. Always use it (never a raw `UPDATE`) for synced tables.
- `ctx.insert(table, row)` inserts a synced row with the next `serverSeq`, so devices pull it.

## Recipe: add a column and backfill it

Example: add `patients.nickname`, filled from the first name.

**1. Server migration.** Run `npm run migration:new -- add patient nickname --ts`, then fill it in:

```ts
import type { MigrationContext } from './types.js';

export async function up(ctx: MigrationContext) {
  await ctx.db.exec("ALTER TABLE patients ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
  await ctx.backfill('patients', (row) => ({ nickname: String(row.firstName) }), "nickname = ''");
}
```

If you only add the column (no backfill), use a `.sql` migration instead.

**2. Shared definition** (`shared/src/index.ts`): add `nickname` to the `Patient` interface and to `TABLE_COLUMNS.patients`. Until a column is in this list the server ignores it on push. If only some values are valid, add a rule to `validation.ts`.

**3. Client** (`services/web/src/data/db.ts`): add a new Dexie version for a new *indexed* field, a new table, or a data change. Never edit an old version.

```ts
this.version(4).stores({ /* only tables whose indexes changed, plus new tables */ })
  .upgrade((tx) => tx.table('patients').toCollection().modify((p) => {
    p.nickname = p.firstName;
    p.updatedAt = new Date().toISOString(); // so the change syncs
    p.dirty = 1;
  }));
```

A plain, non-indexed new field needs no Dexie version; it simply appears on rows as they are written. Give it a default in `emptyPatient()` and the form, and treat `undefined` as empty when reading.

**4. Tests:**
- **Server:** add a case to `services/api/src/migrations.test.ts`. Run the migrations up to the previous version, insert old-shape rows, then run the rest and check the result.
- **Device:** add an upgrade test next to `services/web/src/data/db.ts` (for example `db.upgrade.test.ts`). Create the previous Dexie version in fake-indexeddb, put old-shape rows in it, open `ClinicDB`, and check the result.

## Recipe: add a new table

1. **Migration:** a `.sql` file with `CREATE TABLE`.
   - Include the standard columns: `id TEXT PRIMARY KEY, createdAt, updatedAt, isDeleted INTEGER NOT NULL DEFAULT 0, serverSeq INTEGER NOT NULL`, plus an index on `serverSeq`.
   - Declare foreign keys with `REFERENCES`.
2. **`shared`:** add the row type, add it to `SYNC_TABLES` **after its parents**, and list its columns in `TABLE_COLUMNS`.
3. **Client:** add the Dexie table in a new version, and the typed property on `ClinicDB`.
4. Add a service and hooks for it.

## Moving data between shapes (devices are offline too)

A device may upgrade while offline and sync later. Its own upgrade must therefore produce **exactly** what the server migration produced:

1. **Put the transform in `shared` and freeze it** (e.g. `shared/src/upgrade-v4.ts`). The server migration and the Dexie upgrade both call it, so they cannot drift apart.
2. **Give rows created by the move deterministic ids** (`deterministicUuid('v4-thing:' + sourceId)`, from `shared/src/ids.ts`). The device then pushes the same rows the server already has, instead of duplicates.
3. **On the device, mark changed rows dirty only when needed.** The server already converted its copy, so a device only re-sends rows where it holds something the server does not, such as unsynced edits.

## Rules

1. **Never edit, rename or re-date a migration that has shipped.** Fix mistakes with a new one. The same applies to a frozen shared transform: add a new module for the next restructuring.
2. Prefer changes that are **additive and defaulted** (`ADD COLUMN … DEFAULT …`) so devices running the previous app version keep syncing while the new one rolls out. When a destructive change is unavoidable, convert data on both sides with shared, deterministic transforms.
3. Write portable SQL (see `infrastructure/db/driver.ts`) so the same migration runs on Postgres later.
4. **Deploy order:** server first (it migrates itself), then clients update automatically (service worker) or through the new installer (desktop).
5. Test the backfill on a copy of production data. Copy the file from `data/backups`, with its `-wal` file if present.

## Restoring

Stop the server, copy the desired file from `BACKUP_DIR` over `clinic.db`, then start the server. Migrations re-run as needed.
