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

Types, vocabularies (`vocab.ts`), the FDI tooth catalog, outlines and layout (`teeth.ts`), name formatting (`names.ts`), countries (`countries.ts`), column validation (`validation.ts`), the frozen v1→v2 data transforms (`legacy.ts`), and the **sync table definitions** (`SYNC_TABLES`, `TABLE_COLUMNS`). Both sides import it, so they cannot disagree on the wire format or on what a valid value is.

## Data model

Every synced table carries: `id` (UUID, generated on the device), `createdAt`, `updatedAt`, `isDeleted` (soft delete). The server adds `serverSeq` (sync cursor). Money is stored as integer centavos.

```
patients 1 ──< patient_contacts          (type, value, label, isPrimary)
patients 1 ──< patient_addresses         (label, street, district, city, province, postalCode, countryCode, isPrimary)
patients 1 ──< procedures                (type, date, time, costCents, remarks)
procedures 1 ──< payments                (amountCents, paidAt, method, remarks)
patients 1 ──< dental_records >── 0..1 procedures     (one dated chart entry; usually from a procedure)
dental_records 1 ──< tooth_entries >── teeth           (condition, remarks; also keyed to patient + procedure)

teeth                                    (server-only reference: the 52 FDI teeth, name, kind, quadrant)
```

`patients` holds `salutation, firstName, middleName, lastName, birthDate, occupation, civilStatus, citizenshipCode, photo, remarks`. Since 0.2.0 the schema is in third normal form: nothing derivable is stored, and each fact has one home.

Design decisions worth knowing:

- **Names are stored as parts; the full name is derived** (`formatName` in `shared/names.ts`), in whichever form a screen needs ("Ms. Maria Clara Santos", "Santos, Maria C."). Sorting and A–Z grouping use the last name, ignoring case and accents.
- **Countries are ISO 3166 alpha-2 codes** (`PH`). Names come from the browser (`Intl.DisplayNames`), so there is no country table to maintain.
- **Small fixed vocabularies are validated codes, not lookup tables.** Salutation, civil status, contact type, address label, payment method and tooth condition are lists in `shared/vocab.ts`, enforced on the server by `validateColumns`. A table would add joins and sync rows without adding information. The tooth catalog is the exception: it is a real reference entity (52 rows with attributes) and `tooth_entries.tooth` has a foreign key to it. Procedure types stay free text until there is a price list (see roadmap).
- **One primary per list.** Each patient has at most one primary contact and one primary address. The form enforces it; lists show the primary first.
- **Balances are derived from payments:** `balance = costCents − Σ payments.amountCents`. A procedure can have any number of payments (part payments, different methods).
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

Known limits (accepted for v1): conflicts are whole-row, so two devices editing the same row offline keep only the later edit; sync trusts each device's clock within the clamp. Payments recorded by staff sync like any other row; each payment is its own row, so two devices recording payments offline never overwrite each other. Server-authoritative features (queue numbers, gateway payment confirmations) must **not** use this path; see the roadmap.

**Schema upgrades on devices.** When a release changes the schema, the device's database upgrades itself (Dexie versions) using the **same frozen transforms** as the server migration (`shared/legacy.ts`), and rows created by the upgrade get **deterministic ids** (a hash of the source row id). A device that upgrades offline and the server therefore produce the same rows, and syncing them later merges instead of duplicating.

## Offline packaging

`vite-plugin-pwa` generates a service worker that precaches every built asset (including the lazily loaded PDF code) plus a web manifest and icons. After the first visit the app opens with no network, and can be installed as a standalone window. `registerType: 'autoUpdate'` applies new versions on next launch. `index.html`, `sw.js` and the manifest are served `no-cache` so updates reach installed copies; hashed assets are `immutable`.

**Opening the app needs no server.** On first launch staff create a **local PIN** (4–6 digits, stored as a salted PBKDF2 hash on the device, with back-off after 5 wrong tries). The PIN opens each new session and is the only way out of *patient mode*. **Sync is off by default**; switching it on asks once for the clinic server password, which returns the sync token. If the token expires or is revoked the app switches back to offline and keeps working. A forgotten PIN is reset by proving the server password (online), and local records are kept.

### Lock stages (`hooks/useLock.tsx`)

| Stage | Shown | Leaves by |
| --- | --- | --- |
| `setup` | Create PIN | Creating a PIN |
| `locked` | PIN screen | Correct PIN |
| `patient` | Registration form only (no navigation, records or balances); survives reload | Correct PIN ("Staff unlock") |
| `open` | Full staff app | Lock → *Hand to patient* or *Lock app* |

Patients are **not** isolated by default; staff enter patient mode only with the Lock button.

## Security model

- **Default deny.** Every `/api` route must declare its protection (`public`, `any`, or a specific permission) in its route config. A route that declares nothing returns 403, so a forgotten check cannot expose data.
- **Authentication is a port** (`AuthProvider`). Today: one shared clinic password (constant-time compare of hashes). Replace with user accounts, magic links or OIDC by implementing the interface; nothing else changes.
- **Authorization is permission-based.** Roles (`admin`, `staff`, `patient`) are bundles of permissions in `ROLE_PERMISSIONS`; handlers never test roles. The `patient` role deliberately has no `sync:*` permission (see roadmap).
- Signed (HMAC-SHA256), expiring bearer tokens; tampered, forged, expired and wrong-role tokens are tested.
- Login throttling (8 failures / 15 min per client), identical error for every failure cause.
- Strict JSON-schema input validation, 25 MB body limit, security headers (CSP, `nosniff`, `X-Frame-Options`, HSTS in production, camera-only permissions policy), `Cache-Control: no-store` on API responses, credentials redacted from logs, internal errors never leaked.
- Production refuses to boot without `CLINIC_PASSWORD` and a 24+ character `AUTH_SECRET`.
- The **local PIN** is a convenience lock, not encryption: it stops casual access (for example a patient holding the tablet), but someone with the device's browser profile and developer tools could read IndexedDB. It is per device and never sent to the server.
- **Not covered, by design for now:** data at rest on the device is not encrypted (it relies on the device login); the login throttle is in-memory (single instance); serve over HTTPS (the host or reverse proxy must terminate TLS).

## Moving to Postgres

All SQL goes through `SqlDriver` and sticks to portable constructs (`?` placeholders, TEXT/INTEGER, `ON CONFLICT`, `RETURNING`, booleans as 0/1). To move: add `infra/db/postgres.ts` implementing `SqlDriver` (rewrite `?` to `$n`, map `backup` to `pg_dump`/managed snapshots, no-op the foreign-key suspension), add one branch in `infra/db/open.ts`, set `DATABASE_URL=postgres://…`. Migrations, repositories and services are unchanged. Copy existing data once with a script that reads the SQLite file and pushes through the same tables.

## Roadmap: how today's design leaves room (not implemented)

| Future feature | Hook already in place | What it will need |
| --- | --- | --- |
| **Patient portal** (own records, balances) | `Principal` + `Role` incl. `patient`; permission-based guard; token carries `sub`/`role` | A `patient_accounts` table linking a login to a `patientId`; **row-scoped endpoints** (`/me/...`) that filter by the principal's patient. Do not reuse `sync:*`, which is clinic-wide. |
| **Online payments** | **Itemised `payments` table exists since 0.2.0** (amount, method, paidAt); balance is already `cost − Σ payments` | Add `providerRef` and `status` columns for gateway payments. Gateway webhooks write payments on the server (server-authoritative), outside LWW sync. |
| **Appointments / reservations** | UUID ids created anywhere; patient id optional on future rows | `appointments` (patient or guest, start/end, status, procedure type) and clinic hours; slot conflicts must be decided on the server (online-only), not by LWW. |
| **Cost per procedure shown to patients** | `PROCEDURE_TYPES` already maps type → default condition | Promote to a `procedure_types` table (name, default cost, default condition, active); `procedures.type` stays as a text snapshot. A public read endpoint. |
| **HMO accreditation** | Payment method `hmo` already exists | `hmo_providers`, `patient_hmo` (member no., validity), and coverage fields on procedures. |
| **Maps / directions** | Public route category exists (`auth: 'public'`); patient addresses are structured (city, province, postal code, country) | A clinic profile (address, coordinates, hours) and a public `GET /clinic` endpoint. |
| **Queueing** | Health/real-time not needed yet | `queue_tickets` with a server-issued counter; online-only, outside LWW sync. |
| **Reports & analytics** | Money and dates are normalised; derived fields are computable | Server-side aggregate queries behind a `reports:read` permission, or client-side over the local DB for single-device use. |
| **Multiple clinics** | One config object; migrations with backfill | `clinicId` on every table (migration + backfill), carried in the token, applied in repositories. |

Each of these is a **migration plus new tables/endpoints**, which is why the migration framework (backups, transactional steps, sync-aware backfill) was built first. See [MIGRATIONS.md](MIGRATIONS.md).
