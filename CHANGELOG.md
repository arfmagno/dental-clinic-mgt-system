# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Plain-language notes for the clinic are in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

## [Unreleased]

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
