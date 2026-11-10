# Dental Clinic Manager

Patient records, FDI dental charts and procedures for a dental clinic. It is an **offline-first, installable web app (PWA)**: everything is saved on the device first, so the clinic keeps working without internet, and changes sync to a hosted server whenever a connection is available.

- Patients: details, multiple contacts (phone / email / Messenger), optional photo, soft delete, search, styled PDF export
- Dental chart: FDI odontogram (adult and child), per-tooth condition and remarks, full history ("view chart at this point")
- Procedures: always tied to a patient; saving one **always** creates the matching dental record; date and time default to now and can be edited to record past visits
- Records table: sortable and filterable across all procedures, with totals
- Patient-facing intake form that exposes nothing but the registration fields
- Online/offline switch with automatic background sync

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, data model, sync protocol, security model, roadmap design hooks |
| [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) | Module-by-module code reference and "how do I add X" recipes |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | Adding tables/columns and backfilling data safely |
| [docs/HOSTING.md](docs/HOSTING.md) | Deploying, environment variables, backups, installing the app |
| [CHANGELOG.md](CHANGELOG.md) · [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) | What changed, and what it means for the clinic |

## Quick start (development)

Requires Node.js 20+.

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

Sign in with the dev password `clinic` (you will see a warning; it is rejected in production).

```bash
npm run typecheck    # all workspaces
npm test             # server + web unit tests
npm run build        # production web build (includes the service worker)
```

## Install it as an app that works offline

1. Host the server (see [HOSTING.md](docs/HOSTING.md)), or run it on the clinic computer with `start-clinic.bat`.
2. Open the address once in Chrome or Edge and sign in. The browser downloads the whole app.
3. Choose **Install** (the icon in the address bar, or menu → *Install Clinic*). It now has its own window and a Start-menu/desktop icon and **opens with no internet**.
4. Use the **Sync** chip (top right) to see status or switch to *Work offline only*.

Sign-in is needed once per device. Patient data lives in that device's browser storage until it syncs, so do not clear site data on a device with unsynced changes (the chip shows how many are waiting).

## Repository layout

```
apps/server     Fastify API + SQLite (swappable), migrations, sync, auth
apps/web        React PWA: IndexedDB (Dexie), UI, PDF export
packages/shared Domain types, FDI layout, sync table definitions (used by both)
docs/           Documentation
```

## Status

Version 0.1.0. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) for what is in and what is deliberately not yet built.
