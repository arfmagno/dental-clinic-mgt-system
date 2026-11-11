# Design decisions

A case study of the clinic app: the problem, the constraints, the decisions that shaped it, what each one cost, and what I would change. For how the result is built, see [ARCHITECTURE.md](ARCHITECTURE.md). For what it protects against, see [SECURITY.md](SECURITY.md).

## The problem

A small dental clinic in the Philippines kept patient records on paper and in spreadsheets. It needed:

- patient records with dental charts, procedures and payments;
- something the front desk, the dentist and the owner can each use, on a Windows PC, a tablet or a phone;
- an app that **keeps working when the internet drops**, which happens often enough to matter;
- very little to host and run: no IT staff, small budget;
- care with health data, which is sensitive personal information under the Data Privacy Act of 2012.

The requirements arrived in rounds (v0.1 to v0.4), often from watching the app in use: "the patient list won't close", "the user of this doesn't want to see reports", "only have accounts if it's online". Many decisions below were asked of the owner rather than assumed; [SPEC_CHECKLIST.md](SPEC_CHECKLIST.md#design-decisions-recorded) records which.

## Constraints that ranked above everything else

1. **Offline is the normal case, not an error state.** A form must save with the network cable unplugged, and nothing may be lost when the connection returns.
2. **One person maintains it.** Every moving part has to earn its place.
3. **Cheap to host:** one small container or the clinic's own PC.

---

## 1. The device is the source of truth; the server is a meeting point

**Decision.** Every screen reads and writes IndexedDB (Dexie) on the device. Sync is a background process that is **off by default**. The server stores what devices push and hands out a change feed.

**Alternatives.**
- A normal server-rendered or API-first app with an offline cache bolted on. Rejected: every write path would need a second offline path, and the second path is the one that breaks.
- A hosted backend-as-a-service with offline support (Firebase-style). Rejected: lock-in, cost that grows with use, and patient data in a third party's model.

**Consequences.** The app is fast (no request on any screen) and works on a plane. In exchange the server **cannot see a change before it happens**, which shapes the security model (decision 6). "Pending changes" is a real state that the UI must show.

## 2. Last-write-wins per row, not CRDTs or an operation log

**Decision.** Every synced table has `id` (UUID), `createdAt`, `updatedAt` and `isDeleted`, and devices mark local changes `dirty`. Push sends dirty rows, and the server keeps the newer `updatedAt` per row. Pull pages through a global sequence number. The engine is generic over `SYNC_TABLES`.

**Alternatives.**
- CRDTs (Automerge/Yjs). Merge would be field-level and automatic, but it means a document model, bigger payloads, a library at the heart of the data, and harder SQL queries on the server.
- An operation log with server-side replay. Needs the server to own the business rules for every operation, which is a much bigger server.

**Why LWW is enough here.** In a clinic one person edits a given patient at a time. A procedure is created once and rarely edited, and a payment is created or deleted, never edited. Conflicts are rare and narrow, and "the most recent save wins" is easy to explain to staff.

**What it costs, and how that is contained.**
- Two edits to the *same* patient on two offline devices keep only the later one. Contacts are their own rows, so a phone number added on one device survives an address change on another.
- Clocks drift, so the server clamps `updatedAt` that are far in the future (`MAX_CLOCK_SKEW_MS`).
- A row edited while its push is in flight must not be marked clean. The push only clears `dirty` when `updatedAt` still matches, and there is a test for exactly this race.

## 3. Soft deletes, derived balances, and a deliberately small schema

- **Soft deletes everywhere** (`isDeleted`), because a hard delete cannot sync: the other devices would never learn about it. It also makes "undo" and the audit trail possible.
- **Balances are never stored.** They are computed from procedures and payments. A stored balance is a second source of truth that sync can tear apart.
- **Normalised where it pays, not further.** Payments, contacts and the tooth catalog have their own tables. Short vocabularies (procedure types, payment methods, conditions) are codes in shared TypeScript, not lookup tables. The owner pointed out that lookup tables would only add joins and sync rows for lists that change with a code release anyway.
- **Pre-release migrations were collapsed** into one baseline at 0.3.0, because no real clinic data existed yet. After that, migrations are append-only: timestamped `.sql`/`.ts` files with a backup first and a foreign-key check after.

## 4. A plain Node server with SQLite behind a port

**Decision.** Fastify plus SQLite (`better-sqlite3`) in one process, which also serves the built web app. The database sits behind a `SqlDriver` interface and authentication behind an `AuthProvider` interface.

**Alternatives.** Postgres from day one; serverless functions.

**Why.** A clinic produces thousands of rows, not millions. SQLite needs no second container, backs up as one file, and is fast. The port keeps Postgres a one-adapter change (portable SQL rules are written down in `driver.ts`). Serverless was rejected because sync wants transactions and a single writer.

**Cost.** One instance only (SQLite is single-writer and the login throttle is in memory). This is written down as a limit, not hidden.

## 5. One web codebase, three shells

- **PWA** served by the API. Installable, and the service worker precaches everything, so it opens with no network.
- **Electron for Windows**, because the front-desk PC is Windows and staff expect a desktop icon. It loads the same build from disk and **forwards `/api` to the clinic server's address**, so there is no CORS, and plain `http` to a LAN server works. Context isolation and sandboxing are on, and the bridge exposes two functions.
- **A static demo** (GitHub Pages) with no server: the same build with a flag that fills the browser with sample data.

A native or React Native app was not considered worth it: the camera, storage and offline features needed are all available in the browser.

## 6. Authentication: a PIN to open the app, accounts only where they can be enforced

This decision took the most iterations.

1. **v0.2:** one shared staff PIN per device opens the app, and the server password is needed only to switch sync on. The owner chose this because a front desk with five logins a day will not use per-person passwords.
2. **v0.4:** the clinic wanted to know *who* did what. Per-person accounts were built as a synced `staff` table: name, role and a PBKDF2 hash of the PIN. Syncing the table lets a person sign in on any device, offline included.
3. Then the owner asked: *"can we only have this form of authentication if it's online, but if offline just stick to the PIN?"* The chosen answer was **accounts only on devices that sync**. An offline-only device keeps one shared PIN and shows no names. Names only mean something when there is a server to share them through.

**The security question that followed** ("are these to security standards?") exposed a real gap. Staff rows synced like any other row, so **any device holding the clinic password could push itself an admin account**. The fix had three parts:

- **Two kinds of token.** The clinic password identifies a *device*. Signing in while online also exchanges the person's PIN, checked against the *server's* copy of their hash, for a 12-hour *staff* token.
- **A server-side policy for staff rows** (`staffPolicy.ts`). After the first account, only an admin holding a staff token may change accounts, and staff may change only their own PIN. The admin role is read from the server's current row, not from the token, so a demoted admin's token stops working at once.
- **The audit log is append-only on the server**, and each entry is written in the same transaction as the change it describes.

**What was knowingly *not* solved.** The server cannot verify who made a change while a device was offline, because the device says who was signed in. Records other than staff accounts can still be pushed with the device token alone; that is what lets an offline device upload a day's work. Both limits are in [SECURITY.md](SECURITY.md), with the reasons.

## 7. No encryption at rest on the device, but encrypted backups

**Not encrypting IndexedDB** was a deliberate choice. The only key material available offline is a 4–6 digit PIN, and a key derived from it falls to brute force in minutes. A multi-user device would also need the key wrapped once per person, and a forgotten PIN would mean lost records. Full-disk encryption (BitLocker) protects the same files better, so the clinic checklist requires it.

**Backups are different.** A backup file leaves the device: it gets emailed, copied to USB drives, put in the cloud. So *Export all data* encrypts by default with AES-256-GCM, using a key derived from a passphrase (PBKDF2, 310k iterations) through WebCrypto, with no dependency. A backup also **cannot add staff accounts** to a device, which closes the "restore a file that contains my own admin account" path.

## 8. Features the clinic did not ask to see stay off

Reports (collections, aging, top procedures) were built, but the owner said the people using the app *don't want to see reports*. They ship **off by default** behind a per-device switch (`useFeature('reports')`), and the dashboard stays a list of actions. The demo turns them on to show them.

## 9. Quality is measured, in CI

- **Tests run against real implementations, without mocks:**
  - the server runs on in-memory SQLite through the real HTTP stack (`inject`);
  - the web services run on fake-indexeddb with the real Dexie schema;
  - sync is tested against a small fake server with the same last-write-wins rules;
  - Playwright drives the production build against the real server, including offline reloads and the packaged `.exe`.
- **Floors, not targets.** CI fails when:
  - web logic coverage falls below 82% of statements (measured at 85%);
  - axe finds any WCAG 2.1 AA violation, on every page in light and dark mode;
  - Lighthouse scores fall below 90/100/100/90 (currently 95/100/100/100).
- Accessibility checks caught real issues: low-contrast muted text, links distinguished only by colour, nested interactive elements in the patient picker, and a logo link with no name.
- Code-splitting the pages brought the first download from 525 KB to 288 KB (90 KB gzipped).
- **oxlint**, because typescript-eslint did not yet support TypeScript 7.

## What I would do next

- **Per-device tokens with revocation.** Today, changing `AUTH_SECRET` signs out every device at once.
- **Server-enforced permissions on records**, not only on staff accounts. For example, refuse a patient deletion unless it comes from an admin staff token. This would need a short grace period for changes queued offline.
- **Field-level merge for patients.** Patient details are the one table where two people plausibly edit the same row offline.
- **Postgres adapter and a shared login throttle**, if more than one clinic or instance is ever needed.
- **Appointments and a patient portal.** The data model already leaves room for them (see the roadmap in ARCHITECTURE.md).

## Lessons

- **Ask early when the choice is the owner's to make.** The biggest design changes (accounts only with sync, reports off by default, no lookup tables) came from one-line answers to direct questions. Guesses would have cost a release each.
- **Offline-first moves the hard problem from "the network" to "trust".** Sync was the smaller job. Deciding what the server can still guarantee about changes made while it was not watching was the larger one.
- **Write the limits down.** A security note that lists what it does *not* do is more useful to the clinic, and more credible to a reviewer, than one that lists only controls.
