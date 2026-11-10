# Migrations: changing the schema safely

The server schema is owned by **versioned migrations** in `apps/server/src/migrations/`. They run automatically on startup (and with `npm run migrate -w @clinic/server`), in order, once each.

## What the runner guarantees

- Each migration runs in **its own transaction together with its bookkeeping row** (`_migrations`). If anything throws, the database is exactly as it was and the migration is not recorded.
- Before applying anything to a database that already has data, it takes a **snapshot** (`VACUUM INTO`) in `BACKUP_DIR` (default `data/backups`).
- Foreign-key enforcement is suspended during the run (so SQLite table rebuilds are possible) and **verified after every migration**; violations abort it.
- Duplicate ids are rejected; migrations are sorted by `id`.
- `ctx.backfill(...)` updates rows **and** assigns each a new `serverSeq` and `updatedAt`, so every device pulls the backfilled data on its next sync. Always use it (never a raw `UPDATE`) for synced tables.

## Recipe: add a column and backfill it

Example: add `patients.nickname`, filled from the first word of the name.

**1. Server migration** `apps/server/src/migrations/002_patient_nickname.ts`

```ts
import type { Migration } from './types.js';

export const m002: Migration = {
  id: 2,
  name: 'add patients.nickname',
  async up(ctx) {
    await ctx.db.exec("ALTER TABLE patients ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
    await ctx.backfill('patients', (row) => ({ nickname: String(row.fullName).split(' ')[0] }), "nickname = ''");
  },
};
```

Register it at the **end** of the list in `migrations/index.ts`: `export const migrations = [m001, m002];`

**2. Shared definition** `packages/shared/src/index.ts`: add `nickname` to the `Patient` interface and to `TABLE_COLUMNS.patients`. (Until a column is in this list the server ignores it on push.)

**3. Client** `apps/web/src/data/db.ts`: for a new *indexed* field or table, add a new Dexie version (never edit an old one):

```ts
this.version(2).stores({ /* only tables whose indexes changed, plus new tables */ })
  .upgrade((tx) => tx.table('patients').toCollection().modify((p) => {
    p.nickname = p.fullName.split(' ')[0];
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

## Rules

1. **Never edit or renumber a migration that has shipped.** Fix mistakes with a new one.
2. Keep changes **additive and defaulted** (`ADD COLUMN … DEFAULT …`) so devices running the previous app version keep syncing while the new one rolls out. Do destructive changes (drop/rename) in a later release, after all devices have updated.
3. Write portable SQL (see `infra/db/driver.ts`) so the same migration runs on Postgres later.
4. Deploy order for a schema change: server (migrates itself) first, then clients update automatically via the service worker.
5. Test the backfill on a copy of production data: copy the file from `data/backups`.

## Restoring

Stop the server, copy the desired file from `BACKUP_DIR` over `clinic.db`, start the server (migrations re-run as needed).
