# Migrations: changing the schema safely

The server schema is owned by **versioned migrations** in `apps/server/src/migrations/`. They run automatically on startup (and with `npm run migrate -w @clinic/server`), in order, once each.

## What the runner guarantees

- Each migration runs in **its own transaction together with its bookkeeping row** (`_migrations`). If anything throws, the database is exactly as it was and the migration is not recorded.
- Before applying anything to a database that already has data, it takes a **snapshot** (`VACUUM INTO`) in `BACKUP_DIR` (default `data/backups`).
- Foreign-key enforcement is suspended during the run (so SQLite table rebuilds are possible) and **verified after every migration**; violations abort it.
- Duplicate ids are rejected; migrations are sorted by `id`.
- `ctx.backfill(...)` updates rows **and** assigns each a new `serverSeq` and `updatedAt`, so every device pulls the backfilled data on its next sync. Always use it (never a raw `UPDATE`) for synced tables.
- `ctx.insert(table, row)` inserts a synced row with the next `serverSeq`, so devices pull it. Use it when a migration creates rows (for example splitting a column into a child table).

## Recipe: add a column and backfill it

Example: add `patients.nickname`, filled from the first name.

**1. Server migration** `apps/server/src/migrations/003_patient_nickname.ts`

```ts
import type { Migration } from './types.js';

export const m003: Migration = {
  id: 3,
  name: 'add patients.nickname',
  async up(ctx) {
    await ctx.db.exec("ALTER TABLE patients ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
    await ctx.backfill('patients', (row) => ({ nickname: String(row.firstName) }), "nickname = ''");
  },
};
```

Register it at the **end** of the list in `migrations/index.ts`: `export const migrations = [m001, m002, m003];`

**2. Shared definition** `packages/shared/src/index.ts`: add `nickname` to the `Patient` interface and to `TABLE_COLUMNS.patients`. (Until a column is in this list the server ignores it on push.) If only some values are valid, add a rule to `validation.ts`.

**3. Client** `apps/web/src/data/db.ts`: for a new *indexed* field, a new table, or a data change, add a new Dexie version (never edit an old one):

```ts
this.version(3).stores({ /* only tables whose indexes changed, plus new tables */ })
  .upgrade((tx) => tx.table('patients').toCollection().modify((p) => {
    p.nickname = p.firstName;
    p.updatedAt = new Date().toISOString(); // so the change syncs
    p.dirty = 1;
  }));
```

A plain, non-indexed new field needs no Dexie version; it simply appears on rows as they are written. Give it a default in `emptyPatient()` / the form and treat `undefined` as empty when reading.

**4. Test** by adding a case to `apps/server/src/server.test.ts` (see "a later migration can add a column and backfill it").

## Recipe: add a new table

1. Migration with `CREATE TABLE` (include the standard columns: `id TEXT PRIMARY KEY, createdAt, updatedAt, isDeleted INTEGER NOT NULL DEFAULT 0, serverSeq INTEGER NOT NULL`, plus an index on `serverSeq`). Declare foreign keys with `REFERENCES`.
2. `packages/shared`: add the row type, add it to `SYNC_TABLES` **after its parents**, and list its columns in `TABLE_COLUMNS`.
3. Client: add the Dexie table in a new version, and the typed property on `ClinicDB`.
4. Add a service and hooks for it.

## Worked example: migration 002 (v0.1.0 → v0.2.0)

Migration 002 is a restructuring, not just an addition. It is a good template for data-moving changes:

| v0.1.0 | v0.2.0 | How the data moved |
| --- | --- | --- |
| `patients.fullName` | `salutation, firstName, middleName, lastName` | Split on spaces; surname particles (*dela*, *de los*, *san*…) stay with the last name. Staff can correct any split. |
| `patients.citizenship` (text) | `citizenshipCode` (ISO, e.g. `PH`) | Mapped from common words (*Filipino* → `PH`). Unrecognised text is **kept** in remarks, never dropped. |
| `patients.address` (text) | `patient_addresses` row | One *Home*, primary address per patient, the old text in `street`. |
| `procedures.paidCents` | `payments` row | One payment per procedure that had a paid amount, method *Other*, dated at the procedure. |
| `tooth_entries.tooth` (any integer) | FK to the new `teeth` catalog | Table rebuilt with the foreign key; existing values are all valid FDI numbers. |

Two things make it safe with offline devices:

1. **The transforms live in `packages/shared/src/legacy.ts` and are frozen.** The server migration and the device upgrade (Dexie version 2) call the same functions.
2. **Rows created by the move have deterministic ids** (`deterministicUuid('v2-address:' + patientId)`). A device that upgrades while offline creates exactly the rows the server created, and when it syncs, the push matches the existing rows instead of adding duplicates.

Old columns are dropped in the same migration. This is acceptable here because v0.1.0 had a single clinic install and the service worker moves every device to v0.2.0 on its next launch; the device's own upgrade converts its local data before it syncs. **Caveat:** a device still running v0.1.0 that pushes before updating sends rows without the new fields. Edits to existing patients are harmless (columns a client omits are left untouched), but a patient *created* on that old device would arrive with an empty name, and its `paidCents` would be ignored. Open each device once while online after deploying, before entering new records on it.

## Rules

1. **Never edit or renumber a migration that has shipped.** Fix mistakes with a new one. The same applies to `legacy.ts`: add a new module for the next restructuring.
2. Prefer changes that are **additive and defaulted** (`ADD COLUMN … DEFAULT …`) so devices running the previous app version keep syncing while the new one rolls out. When a destructive change is unavoidable, convert data on both sides with shared, deterministic transforms (see migration 002).
3. Write portable SQL (see `infra/db/driver.ts`) so the same migration runs on Postgres later.
4. Deploy order for a schema change: server (migrates itself) first, then clients update automatically via the service worker.
5. Test the backfill on a copy of production data: copy the file from `data/backups` (with its `-wal` file if present).

## Restoring

Stop the server, copy the desired file from `BACKUP_DIR` over `clinic.db`, start the server (migrations re-run as needed).
