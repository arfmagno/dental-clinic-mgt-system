# Release notes

Written for the clinic. The technical list is in [CHANGELOG.md](../CHANGELOG.md).

## Version 0.2.0 (2026-11-10)

### What's new

- **Your own staff PIN.** The first time the app opens on a device, you choose a 4–6 digit PIN. It opens the app and unlocks it. No internet or server needed.
- **Lock button** (top right):
  - **Hand to patient:** the screen shows only the registration form. Patients can't see other records, and reloading the page doesn't get them out. Staff tap **Staff unlock** and enter the PIN to return.
  - **Lock app:** hides everything until the PIN is entered (for when you step away).
- **Add patient** is now its own page for staff (menu → *Add patient*). It has a **"Let the patient fill this in"** button that switches to the patient view.
- **Names in parts:** salutation (optional), first name, middle name (optional) and last name. First and last name are required. The full name is put together automatically.
- **Citizenship** is a country list. The Philippines is selected by default.
- **Contacts and addresses:** mark one of each as **Primary**. Addresses now have separate fields for street, barangay, city, province, postal code and country. A patient can have several.
- **Payments:**
  - Record each payment on its own, with its amount, method (cash, card, e-wallet, bank transfer, HMO, other) and date.
  - You can enter the first payment when you add the procedure.
  - On the patient's page, use **Record payment**, which fills in the remaining balance for you.
  - A wrong payment can be removed.
- **Teeth look like teeth.** Each tooth is drawn with its crown and roots. Fillings, decay, root canals, crowns, impacted and extracted teeth are drawn on the tooth itself. The PDF matches.
- **Patients list:**
  - Grouped by the first letter of the last name, with an A–Z bar to jump to a letter.
  - 25 patients per page.
  - Search also finds addresses and ignores accents (typing *penaflor* finds *Peñaflor*).
- **Light or dark:** use the ☀️ / 🌙 / 🖥️ switch. 🖥️ follows the device setting.
- **Clearer buttons:** buttons say what they do (*Add patient*, *Register*, *Add procedure*, *Record payment*), and every form has **Cancel**.

### Changed behaviour

- **The app starts in offline mode.** Records stay on the device until you turn on **Sync with clinic server** in the Sync chip. The first time, it asks for the clinic server password.
- The patient registration screen no longer appears by itself. It appears only through the Lock button.

### Fixed

- On *Add procedure*, the patient list (including "No patients yet") now closes when you click elsewhere, press Esc or pick a patient.

### Your existing records

- They are converted automatically on the server and on each device, and a backup is taken first.
- **Names:** each name was split into first, middle and last name. Check names with particles or unusual order (for example "Dela Cruz" is kept together as the last name). Fix any that are wrong with **Edit patient**.
- **Addresses:** each old one-line address became a *Home* address. The whole text is in the street field.
- **Citizenship:** text such as "Filipino" was turned into the country. Anything not recognised was copied into the patient's **Remarks**, so nothing is lost.
- **Payments:** each old "amount paid" became one payment (method *Other*), dated on the procedure.
- **Open each device once while online after updating, before entering new patients on it.**

### Decisions made for this version (tell us if any should change)

| Question | Chosen |
| --- | --- |
| Group patients by which letter? | **Last name** (falls back to first name if there is no last name; non-letters go under **#**) |
| Patients per page | **25** |
| Primary contact / address | **At most one of each** per patient |
| Salutations offered | Mr., Ms., Mrs., Mx., Dr., Atty., Engr., Prof. |
| Payment methods | Cash, card, e-wallet (GCash, Maya…), bank transfer, HMO, other |
| PIN length | **4–6 digits**; after 5 wrong tries, a wait that starts at 30 s and doubles (up to 15 min) |
| Lookup tables | Only the **tooth catalog**. Other short lists (salutations, payment methods…) are fixed lists checked by the server. A procedure price list can become a table when price lists are added. |

### Verification status

| Area | Status |
| --- | --- |
| Server: migration 002 on v0.1.0 data, payments/addresses sync, value checks | Automated tests (14), passing; also run on a copy of a real v0.1.0 database |
| Names, paging, conversion of old data, value checks, chart, balances, search | Automated tests (17), passing |
| PIN setup and unlock, patient mode (including reload), add-patient page, A–Z grouping and paging, picker closing, payments, anatomical chart, dark mode, offline default, connecting sync, offline reload and sync after reconnect, soft delete, PDF, lock app | Exercised end to end in Edge against the real server (63 checks, all passing) |
| Upgrading a device that already has v0.1.0 data in its browser, then syncing | Exercised in Edge with real v0.1.0 data against a server that upgraded the same data: no duplicates (10 checks, all passing) |
| Chrome, Firefox, Safari, phones/tablets, camera | **Not tested yet** |
| Docker image | **Not built or run** in the authoring environment |

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
