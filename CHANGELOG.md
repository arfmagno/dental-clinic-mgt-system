# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Plain-language notes for the clinic are in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

## [Unreleased]

### Added
- **Dental classification** per patient: Pediatric (primary teeth), Mixed dentition, or Adult (permanent teeth). The dentist chooses it on the patient form; until then it is suggested from age (under 6 primary, 6–12 mixed, 13+ adult) and shown as "(by age)". The patient page, the Add Record form and the PDF show only that patient's chart (both charts for mixed). Server migration `20261111090001-dental-classification.sql` (additive column `patients.dentalClassification`, default `''`).
- **Transactions** page (`/transactions`): pick a patient, see their outstanding total and every unsettled record, settle one (any amount, defaults to its balance) or select several and settle them in full at once, and see their payment history. Settling adds payment rows; balances stay derived (no new table).
- **In-app pop-ups and notifications:** confirmations are app dialogs with descriptive buttons (no browser `confirm`), and a short notification confirms each action ("Record added", "Payment recorded", "Settled 3 records · ₱…").
- **Phone layout:** bottom tab bar (Home, Patients, Add, Records, Transactions) with an Add sheet, dialogs as bottom sheets, the records table as cards, 16px inputs (no zoom on focus), safe-area insets.
- **Phone country codes:** a phone contact has a country-code dropdown (flag, short code and calling code, e.g. "🇵🇭 PH +63"; Philippines first and the default). Numbers are saved as `+63 917 123 4567` (a leading 0 is dropped); older numbers without a code are read as Philippine and converted on the next save. Search still finds "0917…" and digits-only forms. Flags use a bundled font on Windows (`country-flag-emoji-polyfill`, works offline).
- **Contact button** on Transactions once a patient is picked: uses their primary contact (calls a phone, opens an email, or opens Messenger; anything else is copied). The desktop app hands `tel:`/`mailto:` links to the system.
- **Patients: Simple view** button: names only, in one compact list for quick scrolling (remembered on the device).
- Tests: phone codes, contact links, phone search; end-to-end country code, Contact button, Records/dashboard/Patients changes.
- Tests: classification, settling, pop-ups and notifications, the Transactions flow, the new migration; end-to-end phone layout, classification charts and settling.

### Changed
- Refreshed, more modern look (new colour tokens, icons, softer cards, pill navigation).
- Navigation reads Home, Patients, Add Patient, Add Record, Records, Transactions; "procedure" is called a "record" in buttons and titles (`/records/new`; `/procedures/new` still works).
- Action buttons are short (Edit, Delete, Remove, Pay, Export); descriptive labels stay on the Save/Cancel buttons of pop-ups.
- Light mode by default, switched with a single dark-mode toggle (no "match device" option).
- Patient page: "Dental Records" heading; each record shows a "Payment history" label.
- Dashboard: no Patients / Outstanding balance cards; the outstanding balance moved to Records. Recent actions are labelled by what they concern (Patient, Procedure, Transaction) instead of added/removed.
- Records: the filter reads "Search by patient, procedure, remarks…" with a search icon (also on Patients); "Unpaid only" is now "Unpaid".
- A patient's payment history removes a payment with a trash icon instead of a "Remove" text button.

### Removed
- The Lock button in the navigation bar. The PIN is still asked for in every new session, and "Hand to patient" is on the Add Patient page.
- **Upgrade paths from 0.1.0–0.3.0** (no real clinic data existed yet). The server migrations are collapsed into one baseline, `20261110090000-initial-schema.sql` (the full current schema plus the FDI tooth catalog). Removed: migrations `20261110120000-normalize-patients`, `20261111090000-single-address` and `20261111090001-dental-classification`, the integer-id bookkeeping conversion, the on-device Dexie upgrades (one baseline version remains), `shared/legacy.ts` and `legacy-v3.ts` (`deterministicUuid` moved to `shared/ids.ts`), and their tests. **Databases created before this change must be deleted** (server `clinic.db`, and the browser/desktop app data), unless they were already at the 0.3.0 schema.

## [0.3.0] - 2026-11-11

### Added
- **Windows desktop app** (`services/desktop`, Electron 45): `npm run dist:desktop` builds `Dental-Clinic-Setup-<version>.exe` (Start menu and desktop shortcuts, per-user, no admin). Serves the web build from `app://clinic` with no network; forwards `/api/*` to the clinic server address entered on the Connect page. The PWA install remains available.
- **"Other" procedure type asks for the actual type** (required text box); the typed text is stored as the type and reopens under "Other" when editing.
- **Sample data:** `shared/demo.ts` builds ~60 deterministic patients with contacts, visits, payments and charted teeth. *Load / Remove sample data* on the dashboard (development builds, or any build with `?demo`); `npm run seed [-- --remove]` on the server (refused in production).
- **Migration generator:** `npm run migration:new -- <description> [--ts]`.
- **Linting:** oxlint (TypeScript, React, hooks, imports, Vitest); `npm run lint` (fails on warnings, also checks migration names) and `npm run check` (lint + typecheck + tests).
- **Tests:**
  - Web moved to Vitest with jsdom, Testing Library and fake-indexeddb. Covers domain logic, service integration on IndexedDB, device upgrades v1→v3 and v2→v3, components, and the Connect page.
  - Server: migration runner and files, sample data.
  - Desktop: routing and address validation.
  - Playwright end-to-end suite against the production build and the real server in Edge, including the packaged desktop `.exe`.
  - Counts: 23 server, 39 web, 4 desktop, 16 end-to-end.

### Changed
- **Address is one line plus a country** (default Philippines) on the patient row; one address per patient.
- **Citizenship is shown as a nationality** ("Filipino") and defaults to Filipino. It is still stored as the ISO country code.
- **Date of birth and citizenship are required** in the forms. The server stays lenient, so older records still sync.
- **Migrations are named `<UTC YYYYMMDDHHmmss>-<kebab-description>.sql`** (or `.ts` when code is needed) and loaded from the folder. `_migrations` is keyed by that version. Existing databases are converted on first start (1 → `20261110090000`, 2 → `20261110120000`). The runner refuses a pending migration older than one already applied.
- The initial schema is now a plain `.sql` file.
- `ctx.backfill` takes query parameters.

### Removed
- `patient_addresses` table (migration `20261111090000-single-address`, Dexie version 3; both use the frozen `shared/legacy-v3.ts`). A 0.2.0 device that still pushes addresses is ignored safely.
- Card and HMO from the payment method lists (`PAYMENT_METHODS_OFFERED`). Both remain valid stored values.

### Fixed
- Lint findings: expression statements used for side effects (sync chip, patient picker keys, PDF legend), effect dependencies, and `any` at the database boundary.

## [0.2.0] - 2026-11-10

### Added
- **Add patient page** (`/patients/new`) for staff, separate from the patient list.
- **Staff PIN** (4–6 digits, PBKDF2-hashed on the device, back-off after 5 wrong tries) created on first launch. It opens the app and unlocks it; no server needed. *Forgot PIN* resets it with the clinic server password.
- **Lock button:** *Hand to patient* (isolated registration form that survives reloads; staff PIN to leave) and *Lock app*.
- **Light / dark / match-device** appearance switch, remembered per device.
- **Structured addresses** (`patient_addresses`): label, street, barangay/district, city, province, postal code, country; any number per patient, one primary.
- **Itemised payments** (`payments`): amount, method (cash, card, e-wallet, bank transfer, HMO, other), date/time, remarks; record and remove from the patient page; first payment can be entered with the procedure.
- **Tooth catalog** (`teeth`, server reference table) with FDI names; `tooth_entries.tooth` references it.
- **Patients list:** grouped by last-name initial with an A–Z jump bar; 25 per page with a pager; search also matches address text and ignores accents.
- Salutation (Mr., Ms., Mrs., Mx., Dr., Atty., Engr., Prof.) and citizenship country dropdown.
- Shared column validation (`validateColumns`) enforced by the server on sync.
- Migration 002 and on-device database version 2, sharing frozen transforms with deterministic ids (no duplicates when an offline device syncs after upgrading).
- Tests: 14 server, 17 web (names, paging, legacy transforms, validation); 63-check end-to-end run in Edge.

### Changed
- **Teeth are drawn anatomically** (crown and roots by tooth type; lower arch mirrored) with conditions drawn on the tooth; the PDF uses the same outlines.
- **Names are stored as first / middle / last (+ salutation);** the full name is derived. First and last name are required.
- **Offline is the default.** Sync is opt-in from the Sync chip and asks for the server password once.
- **Patients are no longer isolated by default.** The patient-facing form appears only through the Lock button.
- Buttons describe their action (*Add patient*, *Register*, *Add procedure*, *Record payment*, *Save changes*) and every form has *Cancel*.
- Contacts have a single **primary** marker; primary contact and address are listed first.
- Citizenship is stored as an ISO country code.
- Balances are `cost − Σ payments`.

### Removed
- `patients.fullName`, `patients.address`, `patients.citizenship`, `procedures.paidCents` (data moved by migration 002).
- The sign-in page and the always-isolated `/intake` route.

### Fixed
- Add procedure: the patient list ("No patients yet…") no longer stays open; it closes on outside click, Escape, blur and after picking.

## [0.1.0] - 2026-11-10

First working version.

### Added
- **Patients:** name, address, date of birth (age computed), occupation, civil status, citizenship, remarks, optional photo, any number of contacts (phone, email, Messenger, other); search by name/address/contact; edit everything; soft delete; styled PDF export.
- **Dental chart:** FDI odontogram for adult and child dentition; per-tooth condition (healthy, cavity, cavity filled, missing, extracted, impacted, root canal, crown) and remarks; chart derived from dated dental records, with "view chart at this point".
- **Procedures:** type, date, time, cost, amount paid, remarks; date and time default to now and are editable for past records; a patient is always required; saving always creates the dental record and tooth entries atomically; record payments; edit; delete (cascades to its record).
- **Records view:** all procedures in a sortable, filterable table with totals and an unpaid-only filter.
- **Dashboard:** recent actions and a grid of quick links (add patient, add procedure, find patient, records).
- **Patient intake page:** isolated registration form with no navigation or records; camera capture or upload; images limited to 10 MB and compressed to about 70 KB, stored on the device.
- **Offline-first:** all data stored on the device (IndexedDB); installable PWA whose service worker precaches the whole app so it opens with no internet; online/offline switch; automatic background sync with last-write-wins conflict handling.
- **Server:** Fastify API with SQLite behind a `SqlDriver` port (Postgres-ready design), layered as http → services → repositories → infra, configured entirely through environment variables, versioned API (`/api/v1`), health check, and static hosting of the web app.
- **Migrations:** ordered, transactional, backed up before applying, foreign-key verified, with sync-aware data backfill.
- **Security:** default-deny route protection, pluggable authentication, permission-based authorization, signed expiring tokens, login throttling, input validation, security headers, log redaction, production start-up guards.
- **Packaging and docs:** Dockerfile, Windows `start-clinic.bat`, README, architecture, code guide, migrations guide, hosting guide.
- **Tests:** 11 server tests, 9 web domain tests.

### Known limitations
- Conflicts are resolved per whole row (last write wins); two devices editing the same record offline keep only the later edit.
- Local data on devices is not separately encrypted.
- The Docker image was not built in the authoring environment.
- Patient portal, online payments, appointments, HMO, maps, queueing and analytics are **not implemented** (the design leaves room; see `docs/ARCHITECTURE.md`).
