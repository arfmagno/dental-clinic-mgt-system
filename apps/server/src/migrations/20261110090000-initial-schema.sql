-- v0.1.0 schema. Every synced table has: id (uuid from the device), createdAt, updatedAt,
-- isDeleted (soft delete) and serverSeq (global change counter used by sync pull).

CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO sync_meta (key, value) VALUES ('seq', 0);

CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  fullName TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  birthDate TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  civilStatus TEXT NOT NULL DEFAULT '',
  citizenship TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT ''
);

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
  paidCents INTEGER NOT NULL DEFAULT 0,
  remarks TEXT NOT NULL DEFAULT ''
);

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

CREATE TABLE tooth_entries (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  recordId TEXT NOT NULL REFERENCES dental_records (id),
  patientId TEXT NOT NULL REFERENCES patients (id),
  procedureId TEXT REFERENCES procedures (id),
  tooth INTEGER NOT NULL,
  condition TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_patients_seq ON patients (serverSeq);
CREATE INDEX idx_contacts_seq ON patient_contacts (serverSeq);
CREATE INDEX idx_contacts_patient ON patient_contacts (patientId);
CREATE INDEX idx_procedures_seq ON procedures (serverSeq);
CREATE INDEX idx_procedures_patient ON procedures (patientId, date);
CREATE INDEX idx_records_seq ON dental_records (serverSeq);
CREATE INDEX idx_records_patient ON dental_records (patientId, recordedAt);
CREATE INDEX idx_teeth_seq ON tooth_entries (serverSeq);
CREATE INDEX idx_teeth_patient ON tooth_entries (patientId, tooth);
