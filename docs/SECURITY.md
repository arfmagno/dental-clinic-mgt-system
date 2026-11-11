# Security

How the clinic app protects patient data, what it deliberately does not protect against, and what
the clinic must do itself. Patient records are health information (sensitive personal information
under the Philippine Data Privacy Act of 2012), so the limits are stated as plainly as the controls.

## What is being protected, and from whom

| Asset | Where it lives |
| --- | --- |
| Patient records: identity, contacts, photos, dental charts, procedures, payments | Each device (IndexedDB in the browser or desktop app) and, with sync on, the clinic server (SQLite) |
| Staff accounts: name, role, PIN hash | Same: they sync so a person can sign in on any clinic device |
| Activity log: who added, changed or removed what | Same |
| Backups | Files the clinic exports and keeps |

| Threat | In scope? |
| --- | --- |
| A patient handed the tablet trying to see other patients | Yes: patient mode |
| Someone on the internet reaching the server | Yes: everything on `/api` needs a token |
| A staff member doing what only an admin may (manage staff, restore, delete patients) | Yes: in the app, and on the server for staff accounts |
| A lost or copied backup file | Yes: encrypted with a passphrase by default |
| A stolen, unlocked device or a copied browser profile | Partly: see *Known limits* |
| Someone holding the server password, or the server's database file | Partly: see *Known limits* |
| A malicious server operator | No |

## Layers

### 1. Opening the app on a device

- **Offline-only device:** one shared staff PIN. **Device that syncs:** each person picks their name and enters their own PIN.
- PINs are 4–6 digits, stored only as a salted **PBKDF2-SHA-256** hash (210,000 iterations, 16-byte salt) and compared in constant time.
- After 5 wrong PINs for an account, the device makes you wait: 30 s, doubling up to 15 min.
- The unlocked state lasts for the browser session. Closing the app signs out.
- **Patient mode** (*Hand to patient*) shows only the registration form. It survives a reload and needs a staff PIN to leave.

### 2. Roles

- **Admins** manage staff, restore backups and delete patients. **Staff** do everything else.
- The rules are enforced in the app's services, not only in the screens (`staffService.requireAdmin`).
- The server enforces them for staff accounts, the part that matters most (see 4).
- The clinic always keeps one admin; nobody can deactivate themselves.

### 3. Activity log (audit trail)

- Every add, change and removal of a patient, procedure, payment, chart update or staff account writes an entry with **who** did it.
- The entry is written in the **same database transaction** as the change, so a change cannot happen without its entry.
- Entries sync to the server, which treats them as **append-only**: an entry that already exists is never overwritten.

### 4. The clinic server

- **Two kinds of token.** The clinic password identifies a *device* of the clinic. A *staff* token is issued after the person's PIN is checked against the server's copy of their hash. That needs a device token first, so a PIN alone never reaches patient data.
- Tokens are signed (HMAC-SHA-256) and expire: devices after `TOKEN_TTL_DAYS` (30), staff after 12 hours.
- **Default deny.** Every `/api` route declares its protection; a route that forgets is refused (403).
- **Staff accounts through sync** (`domain/staffPolicy.ts`):
  - The clinic's first account is accepted from any device; there is no admin yet.
  - After that, only an **admin signed in with their own PIN** may add, rename, re-role or deactivate accounts. The admin role is checked against the server's current copy, not the token.
  - A staff member may change only their own PIN.
  - A device token alone (the shared password) changes nothing.
- **Input:**
  - JSON-schema validation of every request; a push carries only the synced tables, at most 1,000 rows each.
  - Each synced row is checked column by column with the same rules the app uses (`shared/validation.ts`): unknown columns are dropped; codes, dates, money and tooth numbers must be valid; every text field must be a string within its length limit with no control characters (names required); links between rows must be ids; a photo must be a JPEG, PNG or WebP data URL under 1 MB.
  - The app applies the same rules before saving on the device, so a bad value is stopped in the form, not left waiting to sync.
  - Output is escaped by React (no raw HTML anywhere), the PDF is drawn as text, and contact links only open `tel:`, plain `mailto:` and Messenger/Facebook addresses.
  - SQL is parameterised; table and column names come from a fixed whitelist.
  - Body limit 25 MB.
- **Throttling:**
  - Clinic password: 8 failures per 15 minutes per client.
  - Staff PIN: the same, per account and client.
  - Every failure gets the same answer.
- **Headers:**
  - A strict Content-Security-Policy: no inline scripts, `frame-ancestors 'none'`.
  - `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
  - A permissions policy that allows only the camera.
  - HSTS in production.
  - `Cache-Control: no-store` on API responses.
- **Logs** redact `Authorization` and cookies and never contain patient data. Internal errors are not exposed to clients.
- **Production refuses to start** without `CLINIC_PASSWORD` and an `AUTH_SECRET` of 24+ characters.

### 5. Backups

- *Export all data* **encrypts by default**: AES-256-GCM with a key derived from a passphrase (PBKDF2-SHA-256, 310,000 iterations, random salt and IV). The passphrase must be at least 8 characters.
- Only the format marker and export time stay readable.
- GCM detects any change: a wrong passphrase and a tampered file are refused the same way.
- An unencrypted export needs an explicit opt-out and says what that means.
- Restoring is admin-only and validates every row.
- A backup file **cannot add staff accounts** to a device; accounts arrive only through sync.

### 6. Windows desktop app

- The window runs with `contextIsolation`, `sandbox` and no Node integration.
- It only navigates within `app://clinic`; other links open in the system browser.
- The preload bridge exposes only reading and setting the server address.

### 7. Supply chain

- `npm audit --omit=dev`: **0 known vulnerabilities** in production dependencies, checked on Nov 12, 2026. The dev-only tooling has moderate advisories that do not ship.
- CI runs lint, type checks, unit tests with a coverage floor, end-to-end tests, accessibility checks (axe, WCAG 2.1 AA) and a Lighthouse audit on every push.

## Known limits (accepted, with reasons)

1. **Data on a device is not encrypted at rest.** IndexedDB relies on the device's own protection. Anyone with the unlocked Windows account, or a copy of the browser profile, can read it with developer tools. The PIN gates the screens, not the files.
   - *Why:* encrypting with a key derived from a PIN would give weak protection anyway (a 4–6 digit PIN), and multi-user devices would need key wrapping per person.
   - *What the clinic must do:* turn on BitLocker (or the device's disk encryption) and give each computer its own Windows login.
2. **PINs are short, and their hashes sync.** Anyone holding the server's database file, a device's browser profile or an unencrypted backup can test all 1,110,000 possible PINs offline. At 210,000 PBKDF2 iterations that takes minutes to hours on ordinary hardware, not years.
   - The PIN is a quick lock for a shared front desk, not a password.
   - Protect the server database and backups like the patient data they sit next to.
3. **Who made an offline change is reported by the device.** A change made offline is recorded on the device under the person signed in there, and the server cannot verify that after the fact. A modified app holding the clinic password could push entries naming someone else. The server does guarantee that entries are never rewritten once received.
4. **Records other than staff accounts can be changed with the clinic password alone.** That is what lets an offline device sync what it collected. Admin-only actions on records (deleting a patient, restoring) are enforced by the app, not the server.
5. **Sync tokens live in `localStorage`/`sessionStorage`.** That is readable by script on the page, which is why the strict CSP (no inline or third-party scripts) matters. There is no per-device revocation; changing `AUTH_SECRET` signs out every device.
6. **The login throttle is in memory.** Correct for one server instance; move it to the database or a shared cache before running several.
7. **TLS is the host's job.** Serve the app over HTTPS (a PaaS or reverse proxy terminates TLS); HSTS is sent in production.

## Operating checklist for the clinic

- [ ] Long, random `CLINIC_PASSWORD` and `AUTH_SECRET` (24+ characters); never reuse them elsewhere.
- [ ] HTTPS only.
- [ ] Disk encryption and a separate Windows login on every clinic computer.
- [ ] Backups encrypted, kept off-site, with the passphrase stored apart from the files.
- [ ] Deactivate staff who leave (Settings → Staff); their activity history stays.
- [ ] If nobody with an admin account can sign in, reset an admin PIN on the server: `npm run reset-pin -w @clinic/server -- "<name>" <new PIN>`.

## Reporting a problem

Please report a vulnerability privately to the repository owner through GitHub's **Report a vulnerability** (Security tab), not in a public issue.
