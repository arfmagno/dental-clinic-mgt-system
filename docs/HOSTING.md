# Hosting and operations

## What you are hosting

One Node.js process that serves **both** the API (`/api/v1/*`) and the built web app, backed by a database file. That is a single small container with one volume.

> The Docker image in this repo has **not been built or run in the environment where it was written** (no Docker available there). The server itself, the production build, static hosting, security headers and sync were tested by running the real server; verify the container on your host with the steps below.

## Environment variables

All configuration is environment-based; nothing else reads `process.env`.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set `production` when hosted. Production **refuses to start** without the two secrets below. |
| `CLINIC_PASSWORD` | `clinic` (dev only) | The clinic server password: entered on a device when sync is switched on (and to reset a forgotten staff PIN). Required in production. |
| `AUTH_SECRET` | dev value | Signs session tokens; 24+ random characters; required in production. Changing it disconnects every device from sync (they keep working offline until reconnected). |
| `DATABASE_URL` | `sqlite:<DATA_DIR>/clinic.db` | `sqlite:` today; `postgres://` is reserved (see Architecture). |
| `DATA_DIR` | `data` | Folder for the database. **Put this on a persistent volume.** |
| `BACKUP_DIR` | `<DATA_DIR>/backups` | Pre-migration snapshots. |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | |
| `WEB_DIR` | `../web/dist` | Built web app to serve. Empty = API only. |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy/PaaS so login throttling sees real client IPs. |
| `CORS_ORIGIN` | empty | Only if the web app is hosted on a different origin; also build the web app with `VITE_API_URL`. **Not needed for the Windows desktop app** (it forwards API calls itself). |
| `TOKEN_TTL_DAYS` | `30` | How long a device stays connected for sync before it must enter the server password again (the app keeps working offline). |
| `LOG_LEVEL` | `info` | |

Generate a secret: `openssl rand -hex 32` (or any password manager).

## Option A: Docker on any host (Fly.io, Render, Railway, a VPS)

```bash
docker build -t dental-clinic .
docker run -d --name clinic -p 8080:8080 -v clinic-data:/data \
  -e CLINIC_PASSWORD='a-strong-password' -e AUTH_SECRET='<64 hex chars>' \
  dental-clinic
curl http://localhost:8080/api/v1/healthz     # {"status":"ok"}
```

Requirements of the host:

- **HTTPS.** Browsers only allow service workers, the camera and installation on HTTPS (localhost excepted). Use the platform's TLS or a reverse proxy (Caddy/nginx) and set `TRUST_PROXY=true`.
- **A persistent volume at `/data`.** Without it, the database disappears on redeploy.
- **One instance.** SQLite is single-writer and the login throttle is in memory. This is ample for a clinic.
- Health check: `GET /api/v1/healthz` (already wired as the image `HEALTHCHECK`).

## Option B: Run on the clinic computer (no hosting)

Double-click `start-clinic.bat` (Windows, Node.js 20+ installed). It installs and builds on first run, starts the server on `http://localhost:3001` and opens it. Edit the password inside the file first. This is the simplest way to get the installable offline app, but the data then lives on that computer; use Option A for access from anywhere.

## Installing the app on a device

### Windows: desktop program (installer)

1. On the build machine: `npm install`, then `npm run dist:desktop`. The result is `services/desktop/release/Dental-Clinic-Setup-<version>.exe` (about 120 MB). The first build downloads Electron and NSIS.
2. Copy the `.exe` to each clinic computer and run it. It installs for the current Windows user (no administrator rights) and adds **Dental Clinic** to the Start menu and the desktop. The installer is not code-signed, so SmartScreen may show *Windows protected your PC*: choose *More info → Run anyway*.
3. Open it from the shortcut and create the staff PIN. It works with no network.
4. To sync, open the Sync chip, switch sync on, and enter the **clinic server address** (for example `192.168.1.10:3001` on the clinic network, or `https://clinic.example.com`) and the server password. Plain `http://` is accepted for a server on the clinic LAN; use `https://` over the internet.
5. To update, run the newer installer. Data is kept; it lives in the Windows user profile (`%APPDATA%Dental Clinic`).

### Browser install (PWA): any device

Open the hosted address in Chrome or Edge, create the staff PIN, then **Install**. Switch on sync from the Sync chip to connect the device to the server. On Android use *Add to Home screen*; on iPhone/iPad use *Share → Add to Home Screen*. After that it opens offline from its own icon.

## Backups

- **Server database:** back up the `/data` volume (the file `clinic.db`, plus `clinic.db-wal` if present) on a schedule, or use your host's volume snapshots. The server also writes a snapshot before every schema migration to `BACKUP_DIR`.
- **Devices** hold a full copy of the data too; once synced they are an additional safety net. Patient data that has *not yet synced* exists only on that device. Keep an eye on the Sync chip's pending count and avoid clearing browser data while it is above zero.

## Upgrading

1. Take a backup.
2. Deploy the new image; migrations apply automatically at start-up (see [MIGRATIONS.md](MIGRATIONS.md)).
3. Open devices while online; the service worker downloads the new version and applies it on the next launch. For the Windows desktop app, run the new installer on each computer.

## Security checklist before going live

- [ ] Strong `CLINIC_PASSWORD`; unique 64-hex `AUTH_SECRET`
- [ ] HTTPS only
- [ ] Persistent, backed-up `/data`
- [ ] Devices that use the app are protected by their own login/screen lock (local data is not separately encrypted)
- [ ] Only share the password with staff; rotate it when someone leaves (change `AUTH_SECRET` too to end all sessions)
