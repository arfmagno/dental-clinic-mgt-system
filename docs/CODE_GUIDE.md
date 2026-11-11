# Code guide

A map of the code and recipes for common changes. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the why.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | API (`:3001`, auto-restart) + web dev server (`:5173`, proxies `/api`) |
| `npm run typecheck` | `tsc --noEmit` in every workspace and the e2e folder |
| `npm test` | Server tests (domain rules, migrations, sync, security) + web domain tests |
| `npm run build` | Typecheck + production web build with service worker (`services/web/dist`) |
| `npm start` | Run the server (serves `services/web/dist` if built) |
| `npm run migrate -w @clinic/server` | Apply pending migrations without starting the server |
| `node services/web/scripts/make-icons.mjs` | Regenerate the PWA icons |

Node 20. TypeScript everywhere; ESM. `better-sqlite3` is pinned to `^11` because v12 ships no prebuilt binary for Node 20.

## Server reference (`services/api/src`)

| File | Purpose |
| --- | --- |
| `index.ts` | Composition root: load config → open DB → migrate → wire services → listen; graceful shutdown |
| `config.ts` | `loadConfig(env)`; the only place that reads environment variables; production guards |
| `infrastructure/db/driver.ts` | The `SqlDriver` / `SqlExecutor` interfaces and the portable-SQL rules |
| `infrastructure/db/sqlite.ts` | SQLite adapter. Serialises access with a mutex so a transaction is never interleaved with other requests; nested transactions are savepoints |
| `infrastructure/db/open.ts` | Picks the adapter from `DATABASE_URL` |
| `infrastructure/auth/tokens.ts` | `TokenSigner`: HMAC-SHA256 signed expiring tokens |
| `migrate.ts` | Migration runner (ordering by version, refuses out-of-order, transactions, backup, FK check, `backfill`/`insert`) |
| `migrate-cli.ts` | `npm run migrate` entry point |
| `migrations/` | Migration files `<UTC YYYYMMDDHHmmss>-<kebab>.sql` or `.ts` (the baseline `20261110090000-initial-schema.sql`); `index.ts` (file-name rules, `checkMigrationFiles`, `loadMigrations`, `LEGACY_VERSIONS`); `generate.ts` (new names and templates); `types.ts` |
| `seed.ts` | `seedDemo` / `unseedDemo`: shared sample data written through `SyncService.push` |
| `scripts/` | `new-migration.ts` (`npm run migration:new`), `check-migrations.ts` (part of `npm run lint`), `seed.ts` (`npm run seed`) |
| `repositories/syncRepository.ts` | `nextSeq`, `upsertIfNewer` (atomic last-write-wins), `changedSince`, `ping` |
| `domain/authorization.ts` | `Role`, `Permission`, `ROLE_PERMISSIONS`, `Principal`, `isRole`, `can` |
| `domain/syncRow.ts` | `acceptIncomingRow`: envelope checks, unknown columns dropped, column rules, clock clamp (`MAX_CLOCK_SKEW_MS`) |
| `domain/errors.ts` | `ValidationError` (→ 400), `AuthError` (→ 401/429) |
| `domain/domain.test.ts` | Unit tests for the domain rules |
| `services/syncService.ts` | `push` (domain row rules, per-row savepoints, dependency order) and `pull` (paged global change feed) |
| `services/authService.ts` | `AuthProvider` port, `PasswordAuthProvider`, `LoginThrottle`, `AuthService` |
| `http/app.ts` | `buildApp(deps)`: wiring only (middlewares → routes under `/api/v1` → web app) |
| `http/middlewares/` | `securityHeaders.ts`, `authGate.ts` (**default-deny**, `RouteAuth`, `req.principal`), `errorHandler.ts` (domain errors → status codes) |
| `http/validators/` | `auth.schema.ts`, `sync.schema.ts`: JSON schemas + request types |
| `http/routes/` | `health.ts`, `auth.ts`, `sync.ts`: thin handlers |
| `http/webApp.ts` | Static hosting of the built web app + SPA fallback |
| `server.test.ts` | Sync-rule and endpoint-security tests (in-memory DB, real HTTP stack via `inject`) |
| `migrations.test.ts` | File naming, generator, loader (.sql + .ts), runner guarantees, the baseline schema matching the shared model |
| `seed.test.ts` | Sample data validity and seeding through sync |

## Web reference (`services/web/src`)

| Folder / file | Purpose |
| --- | --- |
| `data/db.ts` | Dexie schema (`ClinicDB`), the `Local<T>` type (`dirty` flag); one baseline version (numbered 3) |
| `data/repository.ts` | `createRow` / `updateRow` / `softDeleteRow` stamp uuid + timestamps + dirty; `toWire` strips local fields |
| `domain/chart.ts` | `buildChart`: replay dental records oldest→newest, optional "as of" record |
| `domain/format.ts` | Money, dates, `nowLocal()`, `ageOf`, `formatAddress`, `formalName`, `summarize` (last visit, balance from payments) |
| `domain/search.ts` | `matchesPatient` (accent-insensitive, every word must match), `contactSearchText` (phones also as "0917…" and digits) |
| `domain/contact.ts` | `contactLink`: `tel:` / `mailto:` / Messenger link for a contact (Transactions' Contact button) |
| `domain/paging.ts` | `paginate`, `groupStartPages` (A–Z bar), `pageWindow` |
| `services/patientService.ts` | `savePatient` (patient + contacts atomically, one primary contact; address country kept only with an address line), `validatePatient` (names, DOB not in the future, citizenship), `deletePatient` |
| `services/procedureService.ts` | `createProcedure` (procedure + dental record + tooth entries + optional first payment in one transaction), update, `addPayment`, `settleProcedures` (each record in full, one transaction), `deletePayment`, cascade delete |
| `services/pinService.ts` | Staff PIN: PBKDF2 hash, verify with back-off, session unlock flag, patient-mode flag |
| `services/theme.ts` | Light (default) / dark → `html[data-theme]` |
| `services/syncEngine.ts` | `syncOnce`: push dirty rows in batches, then pull pages; LWW rules |
| `services/session.ts` | Sync token: `connectToServer(password)`, `disconnectFromServer()` |
| `services/api.ts` | `fetch` wrapper; `ApiError` (`status 0` = offline) |
| `services/desktop.ts` | `desktop` bridge (only in the Windows app): read/save the clinic server address |
| `services/demoService.ts` | `loadDemoData` / `removeDemoData` (dashboard sample-data tools), `demoToolsEnabled` |
| `services/photoService.ts` | Validate (≤10 MB), resize (≤640 px), JPEG re-encode to ≈70 KB |
| `services/pdfService.ts` | Styled PDF (jsPDF) with anatomical chart, address, nationality, payments; loaded lazily |
| `hooks/useData.ts` | Live queries: summaries, search index (contacts + address), patient bundle, procedures, activity |
| `hooks/useLock.tsx` | `LockProvider`: stages `setup → locked → open ⇄ patient`; create/verify/reset PIN |
| `hooks/useSync.tsx` | `SyncProvider`: offline by default, auto-sync when on (start, reconnect, every 30 s, 1.5 s after edits) |
| `domain/classification.ts` | `classificationOf(patient)`: the dentist's dental classification, or the age suggestion |
| `components/` | `Odontogram`, `DentalChart` (only the classification's chart(s)), `Feedback` (`useFeedback().confirm/notify`: in-app dialogs and notifications; never use `window.confirm/alert`), `Icon`, `ProcedureForm`, `PatientForm`, `ContactsEditor`, `CountrySelect`, `NationalitySelect`, `ProcedureTypeField` (list + "Other" text), `PaymentForm`, `PinForm`, `PhotoPicker`, `PatientPicker`, `ThemeToggle`, `Modal`, `Layout` (top nav; bottom tab bar + Add sheet on phones), `SyncChip` |
| `pages/` | `Dashboard`, `Patients`, `PatientNew`, `PatientDetail`, `AddProcedure` (Add Record), `Records`, `Transactions` (settle one or many), `Connect`, `LockScreens` (`SetupPin`, `Unlock`, `PatientMode`) |
| `domain/procedureType.ts` | `splitProcedureType` / `resolveProcedureType`: stored type to list choice + "Other" text and back |
| `**/*.test.ts(x)` | Vitest: `domain/domain.test.ts` (pure logic), `services/services.test.ts` (services on fake IndexedDB), `components/components.test.tsx`, `components/feedback.test.tsx` (pop-ups, Transactions), `pages/Connect.test.tsx`; setup in `test/setup.ts` |

## Shared reference (`shared/src`)

| File | Purpose |
| --- | --- |
| `index.ts` | Row types, `SYNC_TABLES`, `TABLE_COLUMNS`, money helpers, `paidByProcedure` |
| `vocab.ts` | Conditions, procedure types + `OTHER_PROCEDURE`, salutations, civil statuses, contact types, payment methods + `PAYMENT_METHODS_OFFERED` (no imports, to avoid cycles) |
| `teeth.ts` | FDI quadrants, `TOOTH_CATALOG`, anatomical outlines (`toothShape`), `flattenPath` for the PDF, `toothLayout` |
| `names.ts` | `formatName`, `nameSortKey`, `nameGroup`, `fold` |
| `countries.ts` | `countryOptions` / `countryName` from `Intl.DisplayNames`; `DEFAULT_COUNTRY = 'PH'` |
| `phone.ts` | `DIAL_CODES` (country → calling code), `flagOf`, `parsePhone` / `formatPhone` ("+63 917 123 4567"), `phoneHref` |
| `nationalities.ts` | Country code to nationality (`PH` → Filipino), `nationalityOptions` (Filipino first), `DEFAULT_CITIZENSHIP` |
| `demo.ts` | `buildDemoData`: deterministic sample rows for every synced table |
| `validation.ts` | `validateColumns(table, row)`: used by the server on push |
| `ids.ts` | `deterministicUuid`: same seed → same id (sample data) |

## Conventions

- **Layering is one-directional.** Pages → hooks/services → domain/data. Do not import Dexie in a component; do not put rules in repositories.
- **All writes go through `data/repository.ts`** (or a service built on it) so `updatedAt`/`dirty`/`isDeleted` are always right. Never `table.put` a hand-built row.
- **Never hard-delete.** Use `softDeleteRow`; filter `isDeleted` in queries.
- **Money is integer centavos** (`costCents`, `amountCents`); convert at the form boundary with `toCents`. Never store a balance or paid total; derive it from `payments`.
- **Never store a full name.** Use `formatName` / `formalName`.
- **Buttons say what they do** ("Add patient", not "Submit"), and every form has Cancel.
- **Colours come from CSS variables** in `styles.css` (defined for `[data-theme=light]` and `[data-theme=dark]`), never hard-coded in components.
- **Server SQL must stay portable** (see `infrastructure/db/driver.ts`).
- **Every new `/api` route must declare `config: { auth: ... }`** or it will be denied.
- Comments explain *why* (constraints, trade-offs), not what the line does.

## Recipes

### Add a field to a patient
Follow [MIGRATIONS.md](MIGRATIONS.md) ("add a column"), then: add it to `PatientFields` defaults in `emptyPatient()` (`patientService.ts`), the form (`PatientForm.tsx`), the detail view (`PatientDetail.tsx`) and the PDF (`pdfService.ts`).

### Add a new tooth condition
Add it to `CONDITIONS`, `CONDITION_LABEL` and `CONDITION_COLOR` in `shared/src/vocab.ts`; draw it in `components/Odontogram.tsx` (a `c-<condition>` class on the tooth group plus CSS in `styles.css`) and in `drawTooth` in `pdfService.ts`. Existing data is unaffected. The server accepts it once the shared package is deployed (validation reads the same list).

### Add a procedure type
Add `{ name, condition? }` to `PROCEDURE_TYPES` in `shared/src/vocab.ts`. `condition` is what selected teeth default to for that type. (Procedure type is free text, so existing records are unaffected.)

### Add an API endpoint
1. Service method in `services/` (no HTTP); pure rules go in `domain/`.
2. Request schema + type in `http/validators/`.
3. Route in `http/routes/` with `config: { auth: <'public' | 'any' | Permission> }` and that schema; register it in `http/app.ts`.
4. New permission? Add it to `Permission` and to the roles that should have it in `ROLE_PERMISSIONS` (`domain/authorization.ts`).
5. Add a test in `server.test.ts` covering unauthenticated, wrong-role and success cases.

### Swap the authentication method
Implement `AuthProvider.authenticate(credentials): Promise<Principal | null>` (look up a user, verify a hash, validate an OIDC token...) and pass it to `AuthService` in `index.ts`. Routes and permissions are unchanged. Put the user's identity in `Principal.id`.

### Add a synced table
See "Recipe: add a new table" in [MIGRATIONS.md](MIGRATIONS.md).

## Testing approach

- **Server:** real Fastify app over an in-memory SQLite database via `app.inject`; no mocks. Covers migrations (idempotence, backfill → sync, rollback), sync rules (LWW, dependency order, clock clamp, per-row isolation, FK failures) and security (401/403, forged/expired tokens, throttling, input validation, production guards).
- **Web (Vitest, jsdom):**
  - pure domain functions;
  - **integration** of the real services and Dexie schema on fake-indexeddb, with no mocks;
  - **components** with Testing Library, driven like a user.
- **Desktop:** request routing, path escape and address validation (`node:test`).
- **End to end (Playwright, `e2e/`):** `npm run e2e` builds the web app, starts the real server with a fresh database on :3155 and drives Microsoft Edge. It covers:
  - app shell and lock;
  - patients, procedures and payments;
  - sync/offline and PDF export;
  - phone layout, layout overflow at every width, contacts and lists;
  - the packaged desktop `.exe` (skipped until `npm run dist:desktop` has been run).

  One worker; each test gets a fresh browser profile.
- **Lint:** `npm run lint` (oxlint, `.oxlintrc.json`). typescript-eslint does not support TypeScript 7 yet, and oxlint needs no TypeScript runtime.
