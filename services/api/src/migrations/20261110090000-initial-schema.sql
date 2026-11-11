-- Baseline schema. Every synced table has: id (uuid from the device), createdAt, updatedAt,
-- isDeleted (soft delete) and serverSeq (global change counter used by sync pull).
-- Later schema changes go in new migration files; never edit this one once it has shipped.

CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO sync_meta (key, value) VALUES ('seq', 0);

CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  salutation TEXT NOT NULL DEFAULT '',
  firstName TEXT NOT NULL DEFAULT '',
  middleName TEXT NOT NULL DEFAULT '',
  lastName TEXT NOT NULL DEFAULT '',
  birthDate TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  civilStatus TEXT NOT NULL DEFAULT '',
  citizenshipCode TEXT NOT NULL DEFAULT '',  -- ISO 3166-1 alpha-2
  addressLine1 TEXT NOT NULL DEFAULT '',
  addressCountryCode TEXT NOT NULL DEFAULT '', -- ISO 3166-1 alpha-2, '' when there is no address
  photo TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  dentalClassification TEXT NOT NULL DEFAULT '' -- primary | mixed | permanent; '' = suggest from age
);
CREATE INDEX idx_patients_seq ON patients (serverSeq);

CREATE TABLE patient_contacts (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  patientId TEXT NOT NULL REFERENCES patients (id),
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  isPrimary INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_contacts_seq ON patient_contacts (serverSeq);
CREATE INDEX idx_contacts_patient ON patient_contacts (patientId);

CREATE TABLE procedures (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  patientId TEXT NOT NULL REFERENCES patients (id),
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  costCents INTEGER NOT NULL DEFAULT 0,
  remarks TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_procedures_seq ON procedures (serverSeq);
CREATE INDEX idx_procedures_patient ON procedures (patientId, date);

-- Money received for a procedure. Balance = cost − Σ payments.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  procedureId TEXT NOT NULL REFERENCES procedures (id),
  amountCents INTEGER NOT NULL,
  paidAt TEXT NOT NULL,
  method TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_payments_seq ON payments (serverSeq);
CREATE INDEX idx_payments_procedure ON payments (procedureId);

CREATE TABLE dental_records (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  patientId TEXT NOT NULL REFERENCES patients (id),
  procedureId TEXT REFERENCES procedures (id),
  recordedAt TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_records_seq ON dental_records (serverSeq);
CREATE INDEX idx_records_patient ON dental_records (patientId, recordedAt);

-- FDI tooth catalog (reference data, same as TOOTH_CATALOG in shared/src/teeth.ts).
CREATE TABLE teeth (
  number INTEGER PRIMARY KEY,
  dentition TEXT NOT NULL,
  quadrant INTEGER NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  isUpper INTEGER NOT NULL,
  name TEXT NOT NULL
);
INSERT INTO teeth (number, dentition, quadrant, position, kind, isUpper, name) VALUES
  (11, 'permanent', 1, 1, 'incisor', 1, 'Upper right central incisor'),
  (12, 'permanent', 1, 2, 'incisor', 1, 'Upper right lateral incisor'),
  (13, 'permanent', 1, 3, 'canine', 1, 'Upper right canine'),
  (14, 'permanent', 1, 4, 'premolar', 1, 'Upper right first premolar'),
  (15, 'permanent', 1, 5, 'premolar', 1, 'Upper right second premolar'),
  (16, 'permanent', 1, 6, 'molar', 1, 'Upper right first molar'),
  (17, 'permanent', 1, 7, 'molar', 1, 'Upper right second molar'),
  (18, 'permanent', 1, 8, 'molar', 1, 'Upper right third molar'),
  (21, 'permanent', 2, 1, 'incisor', 1, 'Upper left central incisor'),
  (22, 'permanent', 2, 2, 'incisor', 1, 'Upper left lateral incisor'),
  (23, 'permanent', 2, 3, 'canine', 1, 'Upper left canine'),
  (24, 'permanent', 2, 4, 'premolar', 1, 'Upper left first premolar'),
  (25, 'permanent', 2, 5, 'premolar', 1, 'Upper left second premolar'),
  (26, 'permanent', 2, 6, 'molar', 1, 'Upper left first molar'),
  (27, 'permanent', 2, 7, 'molar', 1, 'Upper left second molar'),
  (28, 'permanent', 2, 8, 'molar', 1, 'Upper left third molar'),
  (31, 'permanent', 3, 1, 'incisor', 0, 'Lower left central incisor'),
  (32, 'permanent', 3, 2, 'incisor', 0, 'Lower left lateral incisor'),
  (33, 'permanent', 3, 3, 'canine', 0, 'Lower left canine'),
  (34, 'permanent', 3, 4, 'premolar', 0, 'Lower left first premolar'),
  (35, 'permanent', 3, 5, 'premolar', 0, 'Lower left second premolar'),
  (36, 'permanent', 3, 6, 'molar', 0, 'Lower left first molar'),
  (37, 'permanent', 3, 7, 'molar', 0, 'Lower left second molar'),
  (38, 'permanent', 3, 8, 'molar', 0, 'Lower left third molar'),
  (41, 'permanent', 4, 1, 'incisor', 0, 'Lower right central incisor'),
  (42, 'permanent', 4, 2, 'incisor', 0, 'Lower right lateral incisor'),
  (43, 'permanent', 4, 3, 'canine', 0, 'Lower right canine'),
  (44, 'permanent', 4, 4, 'premolar', 0, 'Lower right first premolar'),
  (45, 'permanent', 4, 5, 'premolar', 0, 'Lower right second premolar'),
  (46, 'permanent', 4, 6, 'molar', 0, 'Lower right first molar'),
  (47, 'permanent', 4, 7, 'molar', 0, 'Lower right second molar'),
  (48, 'permanent', 4, 8, 'molar', 0, 'Lower right third molar'),
  (51, 'primary', 5, 1, 'incisor', 1, 'Upper right central incisor'),
  (52, 'primary', 5, 2, 'incisor', 1, 'Upper right lateral incisor'),
  (53, 'primary', 5, 3, 'canine', 1, 'Upper right canine'),
  (54, 'primary', 5, 4, 'molar', 1, 'Upper right first molar'),
  (55, 'primary', 5, 5, 'molar', 1, 'Upper right second molar'),
  (61, 'primary', 6, 1, 'incisor', 1, 'Upper left central incisor'),
  (62, 'primary', 6, 2, 'incisor', 1, 'Upper left lateral incisor'),
  (63, 'primary', 6, 3, 'canine', 1, 'Upper left canine'),
  (64, 'primary', 6, 4, 'molar', 1, 'Upper left first molar'),
  (65, 'primary', 6, 5, 'molar', 1, 'Upper left second molar'),
  (71, 'primary', 7, 1, 'incisor', 0, 'Lower left central incisor'),
  (72, 'primary', 7, 2, 'incisor', 0, 'Lower left lateral incisor'),
  (73, 'primary', 7, 3, 'canine', 0, 'Lower left canine'),
  (74, 'primary', 7, 4, 'molar', 0, 'Lower left first molar'),
  (75, 'primary', 7, 5, 'molar', 0, 'Lower left second molar'),
  (81, 'primary', 8, 1, 'incisor', 0, 'Lower right central incisor'),
  (82, 'primary', 8, 2, 'incisor', 0, 'Lower right lateral incisor'),
  (83, 'primary', 8, 3, 'canine', 0, 'Lower right canine'),
  (84, 'primary', 8, 4, 'molar', 0, 'Lower right first molar'),
  (85, 'primary', 8, 5, 'molar', 0, 'Lower right second molar');

CREATE TABLE tooth_entries (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  recordId TEXT NOT NULL REFERENCES dental_records (id),
  patientId TEXT NOT NULL REFERENCES patients (id),
  procedureId TEXT REFERENCES procedures (id),
  tooth INTEGER NOT NULL REFERENCES teeth (number),
  condition TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_teeth_seq ON tooth_entries (serverSeq);
CREATE INDEX idx_teeth_patient ON tooth_entries (patientId, tooth);
