# Spec checklist

Every requested item, where it lives, and how it was verified. **Unit** = automated test in the repo (`npm test`). **E2E** = Playwright spec in `e2e/` (`npm run e2e`), run in Edge against the real server and production build (0.3.0: 16/16 passed). Up to 0.2.0, E2E meant a one-off script (63/63 checks), now replaced by the specs. **Visual** = screenshot reviewed. **Not verified** is said plainly.

## Original specification (v0.1.0)

| Requirement | Where | Verified |
| --- | --- | --- |
| Patients, dental records (FDI odontogram), procedures | `shared/index.ts`, migrations 001/002, `components/Odontogram.tsx` | Unit, E2E |
| Every table has uuid, createdAt, updatedAt, isDeleted | migrations, `data/repository.ts` | Unit (sync tests) |
| Offline/online with a switch | `hooks/useSync.tsx`, `components/SyncChip.tsx` | E2E (offline reload, offline add, reconnect sync) |
| Hostable, packaged app that opens offline | PWA (`vite-plugin-pwa`), `Dockerfile`, `start-clinic.bat` | E2E (service worker, no-network reload). Docker image **not built** |
| Patients view: search, edit, soft delete, multiple contacts, PDF | `pages/Patients.tsx`, `pages/PatientDetail.tsx`, `services/pdfService.ts` | E2E, Visual (PDF) |
| Add patient: photo capture/upload, compressed, stored locally | `components/PhotoPicker.tsx`, `services/photoService.ts` | Upload path in v0.1.0 E2E; **camera not tested** |
| Add procedure: patient required; creates a dental record | `components/ProcedureForm.tsx`, `services/procedureService.ts` | E2E |
| Procedure date/time default to now, editable for past records | `ProcedureForm.tsx` | E2E |
| Records: sortable table | `pages/Records.tsx` | E2E |
| Dashboard: recent actions, quick links | `pages/Dashboard.tsx` | E2E |
| Migrations: add tables/columns safely, backfill | `server/migrate.ts`, `docs/MIGRATIONS.md` | Unit; migration 002 also run on a real v0.1.0 database copy |
| Layered (horizontal) architecture | see ARCHITECTURE.md | Review |
| Code docs and release notes | `docs/`, `CHANGELOG.md` | Review |
| Secure endpoints, room for authN/authZ | default-deny gate, `AuthProvider`, permissions | Unit (401/403, forged/expired tokens, throttle) |
| Future features designed for, not built (portal, payments, appointments, cost list, HMO, maps, queue, analytics) | ARCHITECTURE.md roadmap | Review. Payments are now partly built (itemised, manual) |

## Change request (v0.2.0)

| # | Request | Where | Verified |
| --- | --- | --- | --- |
| 1 | Add patient view apart from the Patients page | `pages/PatientNew.tsx` at `/patients/new`; nav link + dashboard tile | E2E |
| 2 | Teeth should look like teeth | `shared/teeth.ts` outlines, `Odontogram.tsx`, `styles.css`, `pdfService.ts` | E2E (crown + root paths, extracted cross), Visual (screen + PDF) |
| 3 | Descriptive submit buttons; Cancel buttons | all forms | E2E (button labels checked on add patient, patient mode, add procedure) |
| 4 | Patients not isolated by default; lock button is the only way in | `Layout.tsx` lock menu, `hooks/useLock.tsx`, `pages/LockScreens.tsx` | E2E (isolated, survives reload, wrong PIN stays, PIN returns) |
| 5 | Offline mode by default | `useSync.tsx` | E2E (chip shows Offline; server receives nothing until sync is switched on) |
| 6 | Patients paginated and grouped by first character | `pages/Patients.tsx`, `domain/paging.ts` | Unit, E2E (32 patients: groups, 25/page, pager, A–Z jump) |
| 7 | First name required, optional middle name, last name; full name derived; optional salutations | `PatientForm.tsx`, `shared/names.ts`, migration 002 | Unit, E2E (last name required; "Ms. Maria Clara Santos") |
| 8 | Citizenship dropdown | `CountrySelect.tsx`, `shared/countries.ts` | E2E (select, PH default, 267 options) |
| 9 | Contact information has primary | `ContactsEditor.tsx`, `AddressesEditor.tsx`, `withSinglePrimary` | E2E (exactly one primary, listed first) |
| 10 | Normalize all databases | migration 002 + Dexie v2: name parts, `patient_addresses`, `payments`, `teeth` FK; codes instead of free text | Unit (server + legacy transforms); migration run on a real v0.1.0 database; **device upgrade run in Edge** on the same v0.1.0 data, then synced with that server: no duplicate patients, payments or procedures, identical payment ids (10/10 checks) |
| 11 | "No patients yet" list in Add procedure won't close | `PatientPicker.tsx` | E2E (Escape, outside click, pick; re-open on click) |
| 12 | Light/dark mode configurable | `ThemeToggle.tsx`, `services/theme.ts`, theme variables in `styles.css` | E2E (applies, remembered after reload), Visual |
| 13 | Clearer folder names (services instead of apps) | `services/api`, `services/web`, `services/desktop`, `shared/` (done in 0.3.0) | Lint, typecheck, all tests and e2e re-run after the move |
| 14 | Verify everything; ask for design decisions | this file; decisions asked: folders, normalization scope, unlock/sign-in model | — |

## Change request (v0.3.0)

| # | Request | Where | Verified |
| --- | --- | --- | --- |
| 1 | Address = address line 1 + country; no multiple addresses | `Patient.addressLine1/addressCountryCode`, `PatientForm.tsx`, migration `20261111090000-single-address` + Dexie v3 via `shared/legacy-v3.ts` | Unit (transform, device upgrade v1→v3 and v2→v3, server migration v2→v3), Component (one address field), E2E (form, foreign address shows country, 0.2.0 device upgraded in a real browser, server receives the line) |
| 2 | "Other" procedure type has an input for the type | `ProcedureTypeField.tsx`, `domain/procedureType.ts`, `OTHER_PROCEDURE` | Unit, Component, E2E (required; stored as typed; edit reopens under Other) |
| 3 | Hide HMO and card payment for now | `PAYMENT_METHODS_OFFERED` used by both payment forms | Component, E2E (method lists in add procedure and record payment) |
| 4 | Citizenship as nationality, not country; default Filipino | `shared/nationalities.ts`, `NationalitySelect.tsx`, detail page and PDF | Unit, Component, E2E |
| 5 | Date of birth and citizenship required | `validatePatient` (also not in the future) | Unit, Component, E2E |
| 6 | Script to create a migration; standard naming | `npm run migration:new`, `<UTC YYYYMMDDHHmmss>-<kebab>.sql or .ts`, `lint:migrations` | Unit (names, generator, loader, ordering guard); run from the repo root |
| 7 | SQL migrations as .sql | `20261110090000-initial-schema.sql`; `.ts` only where code is needed | Unit (loader runs .sql and .ts) |
| 8 | Linting | oxlint, `.oxlintrc.json`, `npm run lint` | Runs clean (0 warnings) |
| 9 | Tests everywhere: frontend, backend, integration, e2e | Server 23, web 39 (domain, IndexedDB integration, upgrades, components), desktop 4, Playwright 16 | All pass |
| 10 | Bundled app opened from a shortcut | PWA install (unchanged) **and** Windows installer `services/desktop` | E2E drives the packaged `.exe` (offline, data kept across launches, sync through the forwarder); installer built. Installing via the NSIS wizard was **not** run in automation |
| 11 | Dummy data to examine the app | `shared/demo.ts`, dashboard *Load sample data*, `npm run seed` | Unit (valid, consistent, deterministic), Integration (load/remove), E2E (list with 60 patients) |

## Design decisions recorded

| Decision | Choice | Source |
| --- | --- | --- |
| Folder names | `services/api`, `services/web`, `shared/` | Asked, chosen by the owner |
| Normalization scope | Address table, payments table, tooth catalog; **no** lookup tables for short lists | Asked; the owner pointed out lookup tables would be redundant |
| Unlock / sign-in | One local PIN for opening the app and leaving patient mode; server password only to switch on sync (and to reset the PIN) | Asked, chosen by the owner |
| Grouping letter | Last name | Default, see release notes |
| Page size | 25 | Default |
| Primaries | Exactly one primary contact | Default |
| Migration naming | UTC timestamp + kebab description (`.sql`, or `.ts` when code is needed) | Asked, chosen by the owner |
| Bundling | Keep the PWA and add a Windows installer (Electron) | Asked, chosen by the owner ("Both") |
| Desktop to server | Desktop shell forwards `/api` to a saved address (no CORS, LAN http works) | Default, see ARCHITECTURE.md |
| Linter | oxlint (typescript-eslint does not support TypeScript 7) | Default |

## Not verified

- Browsers other than Edge; phones and tablets; camera capture.
- Running the NSIS installer wizard itself (the packaged app it installs is tested); the installer is not code-signed.
- Docker image build and run.
- Performance with thousands of patients.
