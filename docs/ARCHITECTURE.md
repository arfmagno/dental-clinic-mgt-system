# Architecture

## Goals that shaped the design

1. **Works without internet.** The clinic cannot stop because the connection dropped.
2. **Reachable from anywhere.** One hosted copy of the data, so the owner is not tied to one laptop.
3. **Cheap to host and cheap to change later.** One small container; the database, auth and every other external dependency sit behind an interface.
4. **Ready for patient-facing features** (portal, payments, booking...) without reworking the data model.

## Big picture

```
 ┌──────────────── device (PWA) ────────────────┐            ┌──────────── server ────────────┐
 │ UI (React)                                   │            │ http      routes (thin)        │
 │   └ hooks (live queries)                     │            │   └ services  rules            │
 │       └ services (use cases)                 │  HTTPS     │       └ repositories  SQL      │
 │           └ data: IndexedDB (Dexie)  ◄───────┼── sync ────┼──► SqlDriver port              │
 │ Service worker: caches the app for offline   │ push/pull  │        └ SQLite (Postgres later)│
 └──────────────────────────────────────────────┘            └────────────────────────────────┘
```

The UI never talks to the server for normal work. It reads and writes the on-device database; a background sync engine reconciles with the server. That is what makes offline use the *normal* path and not a special mode.

## Layers (horizontal slicing)

Each layer depends only on the one below it, and only through a narrow interface.

### Server (`apps/server/src`)

| Layer | Folder | Responsibility | Must not |
| --- | --- | --- | --- |
| Composition root | `index.ts` | Choose and wire concrete implementations | Contain logic |
| HTTP | `http/` | Parse request, check declared protection, call a service, shape response | Contain business rules or SQL |
| Services | `services/` | Rules: validation, conflict resolution, authentication, authorization | Know about HTTP or SQL dialects |
| Repositories | `repositories/` | SQL for a table family | Contain rules |
| Infrastructure | `infra/` | `SqlDriver` port + SQLite adapter, token signing | Be imported by anything except wiring/repositories |
| Config | `config.ts` | The **only** reader of `process.env` | |

`buildApp(deps)` takes its dependencies as arguments, so tests build the whole app against an in-memory database with no mocks.

### Web (`apps/web/src`)

| Layer | Folder | Responsibility |
| --- | --- | --- |
| Pages / components | `pages/`, `components/` | Rendering and interaction only |
| Hooks | `hooks/` | Live queries over the local DB, sync state |
| Services | `services/` | Use cases: save patient, create procedure, sync, PDF, photo, session |
| Domain | `domain/` | Pure functions: chart replay, age, balances, search (unit tested) |
| Data | `data/` | IndexedDB schema and generic row operations |

### Shared (`packages/shared`)

Types, condition list, FDI tooth layout geometry, and the **sync table definitions** (`SYNC_TABLES`, `TABLE_COLUMNS`). Both sides import it, so they cannot disagree on the wire format.

## Data model

Every table carries: `id` (UUID, generated on the device), `createdAt`, `updatedAt`, `isDeleted` (soft delete). The server adds `serverSeq` (sync cursor). Money is stored as integer centavos.

```
patients 1 ──< patient_contacts          (phone | email | messenger | other)
patients 1 ──< procedures                (type, date, time, costCents, paidCents, remarks)
patients 1 ──< dental_records >── 0..1 procedures     (one dated chart entry; usually from a procedure)
dental_records 1 ──< tooth_entries       (FDI tooth, condition, remarks; also keyed to patient + procedure)
```

Design decisions worth knowing:

- **The chart is derived, not stored.** A patient's current teeth state is "the latest `tooth_entries` per tooth, replaying dental records oldest→newest". That gives full history for free ("view chart at this point"), makes backdated records correct (ordering is by the record's own date/time, not when it was typed), and avoids conflicting writes to a single mutable chart row when two devices sync.
- **Creating a procedure always creates a dental record** (and its tooth entries) in one local transaction (`services/procedureService.ts`), so chart and history cannot drift apart.
- **Last visit and outstanding balance are computed** from procedures, never stored, so they cannot go stale.
- **Age is computed** from `birthDate`.
- **Conditions** are: healthy, cavity, filled ("cavity filled"), missing, extracted, impacted, root canal, crown.
- **Soft delete only.** Deleting a patient hides them; their procedures and records remain. Deleting a procedure also soft-deletes its record and tooth entries.

## Sync protocol

Local-first, **last-write-wins per row** (by `updatedAt`).

- **Push** `POST /api/v1/sync/push` `{ changes: { <table>: Row[] } }` → `{ accepted, stale, rejected }`
  Tables are processed parents-before-children (foreign keys are enforced on the server). Each row is applied in its own savepoint, so one bad row never blocks the rest. The upsert is `INSERT … ON CONFLICT DO UPDATE … WHERE excluded.updatedAt >= table.updatedAt`, so conflict resolution is atomic in the database.
- **Pull** `GET /api/v1/sync/pull?since=<cursor>&limit=` → `{ rows, cursor, hasMore }`
  Every accepted write takes the next value of a global counter (`serverSeq`); clients remember the last cursor they saw and page forward.
- The client marks rows `dirty` on every local write and only clears the flag if the row was not edited again during the push.
- Safeguards: a device clock more than 10 minutes ahead is clamped; unknown columns are dropped; columns a client omits are left untouched (so an old client cannot wipe a newly added column).

Known limits (accepted for v1): conflicts are whole-row, so two devices editing the same row offline keep only the later edit; sync trusts each device's clock within the clamp. Server-authoritative features (e.g. queue numbers, payments) must **not** use this path; see the roadmap.

## Offline packaging

`vite-plugin-pwa` generates a service worker that precaches every built asset (including the lazily loaded PDF code) plus a web manifest and icons. After the first visit the app opens with no network, and can be installed as a standalone window. `registerType: 'autoUpdate'` applies new versions on next launch. `index.html`, `sw.js` and the manifest are served `no-cache` so updates reach installed copies; hashed assets are `immutable`.

Sign-in is needed once per device ("device ready"). After that the token is only needed to sync; if it expires the app keeps working and asks to sign in again.

## Security model

- **Default deny.** Every `/api` route must declare its protection (`public`, `any`, or a specific permission) in its route config. A route that declares nothing returns 403, so a forgotten check cannot expose data.
- **Authentication is a port** (`AuthProvider`). Today: one shared clinic password (constant-time compare of hashes). Replace with user accounts, magic links or OIDC by implementing the interface; nothing else changes.
- **Authorization is permission-based.** Roles (`admin`, `staff`, `patient`) are bundles of permissions in `ROLE_PERMISSIONS`; handlers never test roles. The `patient` role deliberately has no `sync:*` permission (see roadmap).
- Signed (HMAC-SHA256), expiring bearer tokens; tampered, forged, expired and wrong-role tokens are tested.
- Login throttling (8 failures / 15 min per client), identical error for every failure cause.
- Strict JSON-schema input validation, 25 MB body limit, security headers (CSP, `nosniff`, `X-Frame-Options`, HSTS in production, camera-only permissions policy), `Cache-Control: no-store` on API responses, credentials redacted from logs, internal errors never leaked.
- Production refuses to boot without `CLINIC_PASSWORD` and a 24+ character `AUTH_SECRET`.
- **Not covered, by design for now:** data at rest on the device is not encrypted (it relies on the device login); the login throttle is in-memory (single instance); serve over HTTPS (the host or reverse proxy must terminate TLS).

## Moving to Postgres

All SQL goes through `SqlDriver` and sticks to portable constructs (`?` placeholders, TEXT/INTEGER, `ON CONFLICT`, `RETURNING`, booleans as 0/1). To move: add `infra/db/postgres.ts` implementing `SqlDriver` (rewrite `?` to `$n`, map `backup` to `pg_dump`/managed snapshots, no-op the foreign-key suspension), add one branch in `infra/db/open.ts`, set `DATABASE_URL=postgres://…`. Migrations, repositories and services are unchanged. Copy existing data once with a script that reads the SQLite file and pushes through the same tables.

## Roadmap: how today's design leaves room (not implemented)

| Future feature | Hook already in place | What it will need |
| --- | --- | --- |
| **Patient portal** (own records, balances) | `Principal` + `Role` incl. `patient`; permission-based guard; token carries `sub`/`role` | A `patient_accounts` table linking a login to a `patientId`; **row-scoped endpoints** (`/me/...`) that filter by the principal's patient. Do not reuse `sync:*`, which is clinic-wide. |
| **Online payments** | Money in integer centavos; `paidCents` isolated in one place | A `payments` table (`procedureId`, amount, method, provider reference, status). Balance becomes `cost − Σ payments`; a migration **backfills one payment per existing `paidCents`**. Webhooks are server-authoritative, outside LWW sync. |
| **Appointments / reservations** | UUID ids created anywhere; patient id optional on future rows | `appointments` (patient or guest, start/end, status, procedure type) and clinic hours; slot conflicts must be decided on the server (online-only), not by LWW. |
| **Cost per procedure shown to patients** | `PROCEDURE_TYPES` already maps type → default condition | Promote to a `procedure_types` table (name, default cost, default condition, active); `procedures.type` stays as a text snapshot. A public read endpoint. |
| **HMO accreditation** | — | `hmo_providers`, `patient_hmo` (member no., validity), and coverage fields on procedures. |
| **Maps / directions** | Public route category exists (`auth: 'public'`) | A clinic profile (address, coordinates, hours) and a public `GET /clinic` endpoint. |
| **Queueing** | Health/real-time not needed yet | `queue_tickets` with a server-issued counter; online-only, outside LWW sync. |
| **Reports & analytics** | Money and dates are normalised; derived fields are computable | Server-side aggregate queries behind a `reports:read` permission, or client-side over the local DB for single-device use. |
| **Multiple clinics** | One config object; migrations with backfill | `clinicId` on every table (migration + backfill), carried in the token, applied in repositories. |

Each of these is a **migration plus new tables/endpoints**, which is why the migration framework (backups, transactional steps, sync-aware backfill) was built first. See [MIGRATIONS.md](MIGRATIONS.md).
