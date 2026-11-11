# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Plain-language notes for the clinic are in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

## [Unreleased]

## [0.4.0] - 2026-11-12

### Added
- **Public demo build** (`npm run build:demo`, published to GitHub Pages by `.github/workflows/demo.yml`): the app with no server, filled with 60 sample patients in the visitor's browser, a demo banner and *Reset demo*. Works under a sub-path (`DEMO_BASE`) with a `404.html` fallback for deep links.
- README screenshots and a tour GIF (`docs/images`), badges, [docs/DECISIONS.md](docs/DECISIONS.md).
- **Staff accounts on devices that sync.** Sign-in becomes *pick your name, enter your own PIN*; an offline-only device keeps one shared staff PIN ("Clinic staff") and shows no names. Accounts are rows of the synced `staff` table (name, role admin/staff, PBKDF2 PIN hash), so a person can sign in on any clinic device, offline included. **Settings → Staff** (admins): add, rename, change role, reset a PIN, deactivate; the clinic always keeps one admin. **Settings → Account**: who is signed in, change my PIN, *Lock / switch user*. A new device can **Join your clinic** on first launch (downloads records and accounts) instead of creating a PIN.
- **Audit trail:** every add, change and removal of a patient, procedure, payment, chart update or staff account writes an `audit_log` row (who, what, when) in the same transaction as the change. The activity log reads from it and shows *by Name* in accounts mode, with a Staff filter.
- **Server-side staff sign-in and policy:** `POST /api/v1/auth/staff` (needs a device token) checks the person's PIN against the server's copy of their hash and issues a 12-hour staff token; sync uses it when present. `domain/staffPolicy.ts`: after the first account, only an admin signed in with their own PIN may change accounts; staff may change only their own PIN; the admin role is read from the server's current row, not the token. The audit log is append-only on the server. Rejected rows stay pending and the reason is shown in Settings → Sync.
- `npm run reset-pin -w @clinic/server -- "<name>" <PIN>` for the operator when no admin can sign in.
- **Encrypted backups:** *Export all data* asks for a passphrase (8+ characters) and encrypts the file with AES-256-GCM (PBKDF2-SHA-256, 310,000 iterations). Saving without one needs an explicit opt-out. Restore asks for the passphrase. Restoring is admin-only and never adds staff accounts.
- **Reports** (off by default; Settings → Preferences → *Show reports*): a *Last 30 days* summary on the dashboard and a Reports page with 30-day / 90-day / 12-month periods: collected (with change against the previous period), billed, outstanding, new patients, procedures, a collections chart (with a table view), most done procedures, payment methods and unpaid balances by age.
- **Pagination** on Records (25 per page) and Transactions (patients with a balance 20, unsettled records 20, payment history 10), sharing one `Pager` with Patients.
- [docs/SECURITY.md](docs/SECURITY.md): threat model, controls, accepted limits and the clinic's operating checklist.
- **Quality checks in CI:** unit-test coverage with a floor (`npm run coverage`: about 85% statements, 82% branches), accessibility checks with axe (WCAG 2.1 AA) on every page in light and dark mode, and a Lighthouse audit of the production build (`npm run lighthouse`; floors performance 90, accessibility 100, best practices 100, SEO 90; currently 95/100/100/100).
- Tests: staff accounts and policy (server and app), sync against a fake server, reports, features, backup encryption; end-to-end staff sign-in, pagination, reports, accessibility.
- **Settings** page (gear at the right end of the top bar) with an **Activity log** (every action, grouped by day, filters, loads more as you scroll), **Preferences** (dark mode), **Sync** (moved here from the sync chip pop-up; the chip now opens it) and **Backup**: *Export all data* saves every table (deleted rows too, photos included) as one JSON file, offline, and shows when this device last backed up. **Restore from a backup** checks the file (format and every row, by the server's own rules) and merges it in: missing records are added and a record is only replaced by a newer copy, so nothing newer on the device (or, through sync, on the server) is ever overwritten.
- Dashboard **Settle Balances** action showing how many patients owe and the total; it opens Transactions on a new **Patients with a balance** list (largest first, one tap to settle).
- **Update chart without a procedure:** the patient's dental chart has an **Update chart** button for exam findings, work done at another clinic, or corrections. It saves a dental record with no procedure (no charge), listed under the chart as a chart update that can be viewed at that point or deleted. Uses the existing nullable `procedureId` on `dental_records`/`tooth_entries`, so no migration.
- **GitHub automation:** CI on every push and pull request (lint, typecheck, unit and end-to-end tests), a release workflow on version tags (Windows installer on a GitHub Release, server image on GHCR), and weekly Dependabot updates.
- **Dental classification** per patient: Pediatric (primary teeth), Mixed dentition, or Adult (permanent teeth). The dentist chooses it on the patient form; until then it is suggested from age (under 6 primary, 6–12 mixed, 13+ adult) and shown as "(by age)". The patient page, the Add Record form and the PDF show only that patient's chart (both charts for mixed). Server migration `20261111090001-dental-classification.sql` (additive column `patients.dentalClassification`, default `''`).
- **Transactions** page (`/transactions`): pick a patient, see their outstanding total and every unsettled record, settle one (any amount, defaults to its balance) or select several and settle them in full at once, and see their payment history. Settling adds payment rows; balances stay derived (no new table).
- **In-app pop-ups and notifications:** confirmations are app dialogs with descriptive buttons (no browser `confirm`), and a short notification confirms each action ("Record added", "Payment recorded", "Settled 3 records · ₱…").
- **Phone layout:** bottom tab bar (Home, Patients, Add, Records, Transactions) with an Add sheet, dialogs as bottom sheets, the records table as cards, 16px inputs (no zoom on focus), safe-area insets.
- **Phone country codes:** a phone contact has a country-code dropdown (flag, short code and calling code, e.g. "🇵🇭 PH +63"; Philippines first and the default). Numbers are saved as `+63 917 123 4567` (a leading 0 is dropped); older numbers without a code are read as Philippine and converted on the next save. Search still finds "0917…" and digits-only forms. Flags use a bundled font on Windows (`country-flag-emoji-polyfill`, works offline).
- **Contact button** on Transactions once a patient is picked: uses their primary contact (calls a phone, opens an email, or opens Messenger; anything else is copied). The desktop app hands `tel:`/`mailto:` links to the system.
- **Patients: Simple view** button: names only, in one compact list for quick scrolling (remembered on the device).
- Tests: chart updates (service and end to end), the dashboard activity panel.
- Tests: phone codes, contact links, phone search; end-to-end country code, Contact button, Records/dashboard/Patients changes.
- Tests: classification, settling, pop-ups and notifications, the Transactions flow, the new migration; end-to-end phone layout, classification charts and settling.

### Security
- **Every text field is validated on the server and on the device** with the same rules: type, length limits (names 80, address and contacts 200, remarks 2,000), required names, no control characters; links between rows must be ids; photos must be JPEG/PNG/WebP data URLs under 1 MB. Forms stop typing at the limit.
- The push request accepts only the synced tables, as arrays of at most 1,000 rows.
- Contact links: Messenger contacts only open Messenger or Facebook, and email links only plain addresses (no extra mail headers).

### Changed
- The clinic's **outstanding balance** moved from Records to the top of Transactions (shown until a patient is picked).
- **Activity rows** are laid out on one grid: a same-size icon per kind, the title, then *Kind · Action · by*, with the time on the title's line (replaces the text badges of different widths).
- **New patients default to Adult (permanent teeth)** for dental classification; the dentist changes it on the patient form, where *By age* is still offered. Patients saved earlier without one are still suggested from their age.
- `start-clinic.bat` makes a random `AUTH_SECRET` once per computer (kept in `services/api/data`) instead of a fixed value in the repository.
- Deleting a patient and restoring a backup are admin-only (in the services, not only the screens).
- Pages other than the dashboard load on demand, and the server compresses responses: the main bundle went from 525 KB to 288 KB (90 KB gzipped).
- Accessibility: stronger contrast for muted text, success and danger colours and primary buttons; links in text are underlined; the patient picker's options follow the ARIA combobox pattern; the logo link has a name.
- A forgotten PIN on a device that syncs is reset by an admin (Settings → Staff) instead of with the server password; an offline-only device keeps the server-password reset.
- The sync chip in the top bar no longer shows a number ("Offline", "Waiting to sync", "Synced"…); how many changes wait is in Settings → Sync.
- **Patient photo:** once a photo is taken or uploaded, the Camera / Upload buttons give way to two icon buttons, retake (or choose another) and delete. The photo can be dragged (or moved with the arrow keys) and zoomed to reposition it; the stored photo is a square cut from the original each time, so adjusting never loses quality.
- Refreshed, more modern look (new colour tokens, icons, softer cards, pill navigation).
- Navigation reads Home, Patients, Records, Transactions (Add Patient and Add Record are dashboard tiles, page buttons and, on phones, the + tab); "procedure" is called a "record" in buttons and titles (`/records/new`; `/procedures/new` still works).
- Action buttons are short (Edit, Delete, Remove, Pay, Export); descriptive labels stay on the Save/Cancel buttons of pop-ups.
- Light mode by default, switched with a single dark-mode toggle (no "match device" option).
- Patient page: "Dental Records" heading; each record shows a "Payment history" label.
- Dashboard: no Patients / Outstanding balance cards; the outstanding balance moved to Records. Recent actions are labelled by what they concern (Patient, Procedure, Transaction) instead of added/removed.
- Dashboard: the actions are highlighted (larger tiles, Add Patient and Add Record in the brand colour) (Add Patient and Add Record on top, the other three below) with a short **Recent activity** list (latest 8) below them (*View all* opens the activity log in Settings), and a greeting with the date.
- The dark-mode button moved from the top bar to Settings → Preferences (the lock screen keeps its own).
- Records: the filter reads "Search by patient, procedure, remarks…" with a search icon (also on Patients); "Unpaid only" is now "Unpaid".
- A patient's payment history removes a payment with a trash icon instead of a "Remove" text button.

### Removed
- The **sample data** tool (Load / Remove sample data on the dashboard, `?demo`). Sample data stays available for development through `npm run seed` and the end-to-end test helper.
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
