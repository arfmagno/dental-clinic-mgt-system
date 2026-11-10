# Release notes

Written for the clinic. The technical list is in [CHANGELOG.md](../CHANGELOG.md).

## Version 0.1.0 (2026-11-10): first release

### What you can do

- **Keep patient records**: details, several contact methods (including Messenger), an optional photo. Everything can be edited, and deleting only hides a patient (nothing is permanently lost).
- **Chart teeth**: tap teeth on the diagram to record what was done. Each tooth shows its condition by colour. The chart always shows the latest state, and on a patient's page you can pick any past procedure and tap **View chart at this point** to see the teeth as they were then.
- **Record procedures**: type, date, time, cost and what was paid. The date and time start at *now* but you can change them to enter earlier visits. Saving a procedure **automatically updates the patient's dental record**. The balance and the "last visit" are worked out for you.
- **Review everything** in the Records table: click a column to sort, filter by text, or show only unpaid items. Totals are at the bottom.
- **Let patients register themselves** on *Add patient*: a clean full-screen form that shows nothing else. Staff leave it with the small link at the bottom.
- **Print or share a patient record**: *Export PDF* on any patient.
- **Work without internet.** The app saves on the computer/tablet first. When a connection is available it syncs by itself. The **Sync** chip (top right) shows the status and has a *Work offline only* switch.

### Using it offline

1. Open the clinic's web address once and sign in.
2. Click **Install** in the browser. The app gets its own icon and window.
3. From then on it opens even with no internet.

Sign-in is needed once per device.

### Good to know

- **Changes made offline live only on that device until it reconnects.** The Sync chip shows how many are waiting. Don't clear browser data on a device while changes are waiting.
- If two devices change the *same* record while both are offline, the most recent edit wins.
- **Child chart:** use the *Child* toggle for baby teeth.
- Photos are shrunk to a small size on purpose (large originals up to 10 MB are accepted).

### How the form fields were interpreted

Two items in the spec were open to interpretation; tell us if either should change:

- **Age** is stored as **date of birth** and the age is calculated, so it never goes out of date.
- **"Image remarks"** is covered by a general **Remarks** field on the patient next to the photo.
- **"Cavity filled"** is offered as two conditions: **Cavity** (decay present) and **Cavity filled** (treated).

### Not included yet (planned; the design is ready for them)

Patient portal (own records and balances), online payments, online appointment booking, procedure price list for patients, HMO accreditation, map directions, queueing, and reports/analytics.

### Verification status

| Area | Status |
| --- | --- |
| Server logic, migrations, security | Automated tests (11), passing |
| Chart, balances, search logic | Automated tests (9), passing |
| Sign-in, intake, add procedure → record, search, sort, past-dated entry, soft delete, PDF export | Exercised in a real browser (Edge) against the real server |
| Opening with **no network**; adding a patient offline and syncing after reconnect; a second device receiving data | Exercised in a real browser (Edge) |
| Chrome, Firefox, Safari, phones/tablets; camera capture; the *Child* chart view; installing from the address bar | **Not tested yet**: try on the devices you will actually use |
| Docker image | **Not built or run** in the authoring environment: verify on your host |
| Behaviour with large data volumes (thousands of patients) | Not measured |

### Upgrading

Take a backup of the server's data folder, deploy, and open the app while online. The database upgrades itself (a snapshot is saved first) and devices pick up the new version on their next launch. See [HOSTING.md](HOSTING.md).
