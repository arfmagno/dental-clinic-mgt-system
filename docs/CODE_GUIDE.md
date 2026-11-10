# Code guide

A map of the code and recipes for common changes. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the why.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | API (`:3001`, auto-restart) + web dev server (`:5173`, proxies `/api`) |
| `npm run typecheck` | `tsc --noEmit` in all three packages |
| `npm test` | Server tests (migrations, sync, security) + web domain tests |
| `npm run build` | Typecheck + production web build with service worker (`apps/web/dist`) |
| `npm start` | Run the server (serves `apps/web/dist` if built) |
| `npm run migrate -w @clinic/server` | Apply pending migrations without starting the server |
| `node apps/web/scripts/make-icons.mjs` | Regenerate the PWA icons |

Node 20. TypeScript everywhere; ESM. `better-sqlite3` is pinned to `^11` because v12 ships no prebuilt binary for Node 20.

## Server reference (`apps/server/src`)

| File | Purpose |
| --- | --- |
| `index.ts` | Composition root: load config → open DB → migrate → wire services → listen; graceful shutdown |
| `config.ts` | `loadConfig(env)`; the only place that reads environment variables; production guards |
| `infra/db/driver.ts` | The `SqlDriver` / `SqlExecutor` interfaces and the portable-SQL rules |
| `infra/db/sqlite.ts` | SQLite adapter. Serialises access with a mutex so a transaction is never interleaved with other requests; nested transactions are savepoints |
| `infra/db/open.ts` | Picks the adapter from `DATABASE_URL` |
| `infra/auth/tokens.ts` | `TokenSigner`: HMAC-SHA256 signed expiring tokens |
| `migrate.ts` | Migration runner (ordering, transactions, backup, FK check, `backfill`) |
| `migrate-cli.ts` | `npm run migrate` entry point |
| `migrations/` | `types.ts`, `001_initial.ts`, `002_normalize.ts` (names, addresses, payments, teeth), `index.ts` (the ordered list) |
| `repositories/syncRepository.ts` | `nextSeq`, `upsertIfNewer` (atomic last-write-wins), `changedSince`, `ping` |
| `services/syncService.ts` | `push` (validate, clamp clocks, per-row savepoints, dependency order) and `pull` (paged global change feed) |
| `services/authService.ts` | `AuthProvider` port, `PasswordAuthProvider`, `ROLE_PERMISSIONS`, `can`, `LoginThrottle`, `AuthService` |
| `http/app.ts` | `buildApp(deps)`: security headers, **default-deny auth gate**, error handler, routes, static hosting + SPA fallback |
| `http/routes/` | `health.ts`, `auth.ts`, `sync.ts`: thin handlers with JSON-schema validation |
| `server.test.ts` | Migration, sync-rule and endpoint-security tests (in-memory DB, real HTTP stack via `inject`) |

## Web reference (`apps/web/src`)

| Folder / file | Purpose |
| --- | --- |
| `data/db.ts` | Dexie schema (`ClinicDB`), the `Local<T>` type (`dirty` flag); version 2 upgrades v0.1.0 data with the shared `legacy.ts` transforms |
| `data/repository.ts` | `createRow` / `updateRow` / `softDeleteRow` stamp uuid + timestamps + dirty; `toWire` strips local fields |
| `domain/chart.ts` | `buildChart`: replay dental records oldest→newest, optional "as of" record |
| `domain/format.ts` | Money, dates, `nowLocal()`, `ageOf`, `formatAddress`, `formalName`, `summarize` (last visit, balance from payments) |
| `domain/search.ts` | `matchesPatient` (accent-insensitive, every word must match) |
| `domain/paging.ts` | `paginate`, `groupStartPages` (A–Z bar), `pageWindow` |
| `services/patientService.ts` | `savePatient` (patient + contacts + addresses atomically, one primary each), `validatePatient`, `deletePatient` |
| `services/procedureService.ts` | `createProcedure` (procedure + dental record + tooth entries + optional first payment in one transaction), update, `addPayment`, `deletePayment`, cascade delete |
| `services/pinService.ts` | Staff PIN: PBKDF2 hash, verify with back-off, session unlock flag, patient-mode flag |
| `services/theme.ts` | Light/dark/system preference → `html[data-theme]` |
| `services/syncEngine.ts` | `syncOnce`: push dirty rows in batches, then pull pages; LWW rules |
| `services/session.ts` | Sync token: `connectToServer(password)`, `disconnectFromServer()` |
| `services/api.ts` | `fetch` wrapper; `ApiError` (`status 0` = offline) |
| `services/photoService.ts` | Validate (≤10 MB), resize (≤640 px), JPEG re-encode to ≈70 KB |
| `services/pdfService.ts` | Styled PDF (jsPDF) with anatomical chart, addresses, payments; loaded lazily |
| `hooks/useData.ts` | Live queries: summaries, search index (contacts + addresses), patient bundle, procedures, activity |
| `hooks/useLock.tsx` | `LockProvider`: stages `setup → locked → open ⇄ patient`; create/verify/reset PIN |
| `hooks/useSync.tsx` | `SyncProvider`: offline by default, auto-sync when on (start, reconnect, every 30 s, 1.5 s after edits) |
| `components/` | `Odontogram`, `ProcedureForm`, `PatientForm`, `ContactsEditor`, `AddressesEditor`, `CountrySelect`, `PaymentForm`, `PinForm`, `PhotoPicker`, `PatientPicker`, `ThemeToggle`, `Modal`, `Layout` (incl. lock menu), `SyncChip` |
| `pages/` | `Dashboard`, `Patients`, `PatientNew`, `PatientDetail`, `AddProcedure`, `Records`, `Connect`, `LockScreens` (`SetupPin`, `Unlock`, `PatientMode`) |
| `domain/domain.test.ts` | Unit tests: chart replay, age, balances, names, search, addresses, paging, legacy transforms, validation |

## Shared reference (`packages/shared/src`)

| File | Purpose |
| --- | --- |
| `index.ts` | Row types, `SYNC_TABLES`, `TABLE_COLUMNS`, money helpers, `paidByProcedure` |
| `vocab.ts` | Conditions, procedure types, salutations, civil statuses, contact types, address labels, payment methods (no imports, to avoid cycles) |
| `teeth.ts` | FDI quadrants, `TOOTH_CATALOG`, anatomical outlines (`toothShape`), `flattenPath` for the PDF, `toothLayout` |
| `names.ts` | `formatName`, `nameSortKey`, `nameGroup`, `fold` |
| `countries.ts` | `countryOptions` / `countryName` from `Intl.DisplayNames`; `DEFAULT_COUNTRY = 'PH'` |
| `validation.ts` | `validateColumns(table, row)`: used by the server on push |
| `legacy.ts` | **Frozen** v1→v2 transforms + `deterministicUuid` (used by migration 002 and Dexie v2) |

## Conventions

- **Layering is one-directional.** Pages → hooks/services → domain/data. Do not import Dexie in a component; do not put rules in repositories.
- **All writes go through `data/repository.ts`** (or a service built on it) so `updatedAt`/`dirty`/`isDeleted` are always right. Never `table.put` a hand-built row.
- **Never hard-delete.** Use `softDeleteRow`; filter `isDeleted` in queries.
- **Money is integer centavos** (`costCents`, `amountCents`); convert at the form boundary with `toCents`. Never store a balance or paid total; derive it from `payments`.
- **Never store a full name.** Use `formatName` / `formalName`.
- **Buttons say what they do** ("Add patient", not "Submit"), and every form has Cancel.
- **Colours come from CSS variables** in `styles.css` (defined for `[data-theme=light]` and `[data-theme=dark]`), never hard-coded in components.
- **Server SQL must stay portable** (see `infra/db/driver.ts`).
- **Every new `/api` route must declare `config: { auth: ... }`** or it will be denied.
- Comments explain *why* (constraints, trade-offs), not what the line does.

## Recipes

### Add a field to a patient
Follow [MIGRATIONS.md](MIGRATIONS.md) ("add a column"), then: add it to `PatientFields` defaults in `emptyPatient()` (`patientService.ts`), the form (`PatientForm.tsx`), the detail view (`PatientDetail.tsx`) and the PDF (`pdfService.ts`).

### Add a new tooth condition
Add it to `CONDITIONS`, `CONDITION_LABEL` and `CONDITION_COLOR` in `packages/shared/src/vocab.ts`; draw it in `components/Odontogram.tsx` (a `c-<condition>` class on the tooth group plus CSS in `styles.css`) and in `drawTooth` in `pdfService.ts`. Existing data is unaffected. The server accepts it once the shared package is deployed (validation reads the same list).

### Add a procedure type
Add `{ name, condition? }` to `PROCEDURE_TYPES` in `packages/shared/src/vocab.ts`. `condition` is what selected teeth default to for that type. (Procedure type is free text, so existing records are unaffected.)

### Add an API endpoint
1. Service method in `services/` (rules, no HTTP).
2. Route in `http/routes/` with `config: { auth: <'public' | 'any' | Permission> }` and a JSON schema; register it in `http/app.ts`.
3. New permission? Add it to `Permission` and to the roles that should have it in `ROLE_PERMISSIONS`.
4. Add a test in `server.test.ts` covering unauthenticated, wrong-role and success cases.

### Swap the authentication method
Implement `AuthProvider.authenticate(credentials): Promise<Principal | null>` (look up a user, verify a hash, validate an OIDC token...) and pass it to `AuthService` in `index.ts`. Routes and permissions are unchanged. Put the user's identity in `Principal.id`.

### Add a synced table
See "Recipe: add a new table" in [MIGRATIONS.md](MIGRATIONS.md).

## Testing approach

- **Server:** real Fastify app over an in-memory SQLite database via `app.inject`; no mocks. Covers migrations (idempotence, backfill → sync, rollback), sync rules (LWW, dependency order, clock clamp, per-row isolation, FK failures) and security (401/403, forged/expired tokens, throttling, input validation, production guards).
- **Web domain:** pure functions with `node:test`.
- **UI/offline behaviour** was verified end to end in headless Edge against the real server and production build (63 checks for 0.2.0; see [SPEC_CHECKLIST.md](SPEC_CHECKLIST.md)). That script is not part of the repo; a Playwright suite is a sensible next addition.
