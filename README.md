# Dental Clinic Manager

Patient records, FDI dental charts, procedures and payments for a dental clinic. It is an **offline-first, installable web app (PWA)**: everything is saved on the device, the clinic keeps working without internet, and records can sync to a hosted server when sync is switched on.

- Patients: salutation and name parts (full name derived), citizenship country, contacts and structured addresses (one primary each), optional photo, soft delete, accent-insensitive search, A–Z grouped and paginated list, styled PDF export
- Dental chart: anatomically drawn FDI odontogram (adult and child), per-tooth condition and remarks, full history ("view chart at this point")
- Procedures: always tied to a patient; saving one **always** creates the matching dental record; date and time default to now and can be edited to record past visits
- Payments: itemised per procedure (amount, method, date); balances are derived
- Records table: sortable and filterable across all procedures, with totals
- Staff PIN lock; patient-facing registration mode reached only from the Lock button
- Offline by default; opt-in background sync; light/dark mode

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, data model, sync protocol, lock stages, security model, roadmap design hooks |
| [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) | Module-by-module code reference and "how do I add X" recipes |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | Adding tables/columns and moving data safely (with migration 002 as a worked example) |
| [docs/HOSTING.md](docs/HOSTING.md) | Deploying, environment variables, backups, installing the app |
| [docs/SPEC_CHECKLIST.md](docs/SPEC_CHECKLIST.md) | Every requested item, where it is implemented, and how it was verified |
| [CHANGELOG.md](CHANGELOG.md) · [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) | What changed, and what it means for the clinic |

## Quick start (development)

Requires Node.js 20+.

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

On first open, create a staff PIN. To try sync, open the Sync chip, switch sync on and enter the dev server password `clinic` (you will see a warning; it is rejected in production).

```bash
npm run typecheck    # all workspaces
npm test             # server + web unit tests
npm run build        # production web build (includes the service worker)
```

## Install it as an app that works offline

1. Host the server (see [HOSTING.md](docs/HOSTING.md)), or run it on the clinic computer with `start-clinic.bat`.
2. Open the address once in Chrome or Edge. The browser downloads the whole app. Create the staff PIN.
3. Choose **Install** (the icon in the address bar, or menu → *Install Clinic*). It now has its own window and a Start-menu/desktop icon and **opens with no internet**.
4. To back up and share records between devices, switch on **Sync with clinic server** in the Sync chip (top right) and enter the clinic server password once.

Patient data lives in that device's browser storage until it syncs, so do not clear site data on a device with unsynced changes (the chip shows how many are waiting).

## Repository layout

```
apps/server     Fastify API + SQLite (swappable), migrations, sync, auth
apps/web        React PWA: IndexedDB (Dexie), UI, PDF export
packages/shared Domain types, vocabularies, tooth catalog and outlines, names, validation, sync table definitions
docs/           Documentation
```

## Status

Version 0.2.0. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) for what is in and what is deliberately not yet built.
