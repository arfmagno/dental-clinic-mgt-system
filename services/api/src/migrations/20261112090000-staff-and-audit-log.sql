-- Staff accounts (each person signs in with their own PIN) and the audit trail of who changed what.
-- Both sync like every other table. Additive only: no existing table changes.

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0, -- 1 = deactivated
  serverSeq INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff',   -- admin | staff
  pinSalt TEXT NOT NULL DEFAULT '',     -- base64; '' = cannot sign in
  pinHash TEXT NOT NULL DEFAULT '',     -- base64 PBKDF2-SHA-256
  pinIterations INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_staff_seq ON staff (serverSeq);

-- Append-only. No foreign keys on purpose: an entry may arrive before (or without) the row it
-- describes, e.g. when a device syncs in several batches.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  serverSeq INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT '',      -- staff id, or 'patient' for self-registration
  action TEXT NOT NULL DEFAULT '',     -- added | updated | removed
  entity TEXT NOT NULL DEFAULT '',     -- staff | patients | procedures | payments | dental_records
  entityId TEXT NOT NULL DEFAULT '',
  patientId TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_audit_seq ON audit_log (serverSeq);
CREATE INDEX idx_audit_patient ON audit_log (patientId, createdAt);
