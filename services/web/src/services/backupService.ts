import { BASE_COLUMNS, SYNC_TABLES, TABLE_COLUMNS, validateColumns, type AnyRow, type SyncTable } from '@clinic/shared';
import { db as defaultDb, type ClinicDB } from '../data/db';
import { requireAdmin } from './staffService';

export const BACKUP_FORMAT = 'magno-dental-clinic-backup';
const LAST_KEY = 'clinic.lastBackupAt';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string; // ISO
  counts: Record<string, number>;
  /** Every row of every table, deleted ones included (they are part of the history). */
  tables: Record<string, AnyRow[]>;
}

/** A complete copy of this device's records (patients with photos, contacts, procedures, payments, charts). */
export async function buildBackup(db: ClinicDB = defaultDb, now = new Date()): Promise<Backup> {
  const tables: Record<string, AnyRow[]> = {};
  await db.transaction('r', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      // `dirty` is this device's sync bookkeeping, not data
      tables[t] = (await db.table<AnyRow & { dirty?: 0 | 1 }>(t).toArray()).map(({ dirty: _dirty, ...row }) => row as AnyRow);
    }
  });
  const counts = Object.fromEntries(SYNC_TABLES.map((t) => [t, tables[t].filter((r) => !r.isDeleted).length]));
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), counts, tables };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const backupFileName = (d = new Date()) =>
  `magno-dental-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;

// ---------------- encryption (passphrase) ----------------
/**
 * An encrypted backup: the whole backup JSON sealed with AES-256-GCM under a key derived from a
 * passphrase (PBKDF2-SHA-256). Only the format marker and the export time stay readable, so the
 * file can be recognised and described before the passphrase is entered. GCM also detects any
 * change to the file: a wrong passphrase and a tampered file are both refused.
 */
export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  encrypted: { cipher: 'AES-256-GCM'; kdf: 'PBKDF2-SHA-256'; iterations: number; salt: string; iv: string; data: string };
}

export const PASSPHRASE_MIN = 8;
const KDF_ITERATIONS = 310_000;

// Chunked: photos make backups large, and spreading millions of bytes into one call overflows the stack.
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function backupKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(backup: Backup, passphrase: string, iterations = KDF_ITERATIONS): Promise<EncryptedBackup> {
  if (passphrase.length < PASSPHRASE_MIN) throw new BackupError(`Use a passphrase of at least ${PASSPHRASE_MIN} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(passphrase, salt, iterations);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(backup)));
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: backup.exportedAt,
    encrypted: { cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(sealed)) },
  };
}

/** The file's envelope when it is an encrypted backup, else null. */
export function encryptedEnvelope(text: string): EncryptedBackup | null {
  try {
    const raw = JSON.parse(text) as Partial<EncryptedBackup> | null;
    const e = raw?.encrypted;
    if (raw?.format !== BACKUP_FORMAT || !e || typeof e !== 'object') return null;
    if (e.cipher !== 'AES-256-GCM' || e.kdf !== 'PBKDF2-SHA-256' || typeof e.data !== 'string' || typeof e.salt !== 'string' || typeof e.iv !== 'string') {
      throw new BackupError('This backup uses an encryption this version of the app does not know.');
    }
    if (!Number.isInteger(e.iterations) || e.iterations < 100_000 || e.iterations > 5_000_000) throw new BackupError('The backup is damaged (encryption settings).');
    return raw as EncryptedBackup;
  } catch (err) {
    if (err instanceof BackupError) throw err;
    return null;
  }
}

/** Opens an encrypted backup; a wrong passphrase or a changed file is refused. Then checked like any backup. */
export async function decryptBackup(envelope: EncryptedBackup, passphrase: string): Promise<Backup> {
  let plain: ArrayBuffer;
  try {
    const e = envelope.encrypted;
    const key = await backupKey(passphrase, fromB64(e.salt), e.iterations);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(e.iv) as BufferSource }, key, fromB64(e.data) as BufferSource);
  } catch {
    throw new BackupError('Wrong passphrase, or the file has been changed.');
  }
  return parseBackup(new TextDecoder().decode(plain));
}

/**
 * Saves the backup as a JSON file through the browser's (or desktop app's) download, encrypted
 * with the passphrase unless the user chose to save it unprotected (passphrase null).
 */
export async function downloadBackup(passphrase: string | null): Promise<Backup> {
  const backup = await buildBackup();
  const content = passphrase === null ? backup : await encryptBackup(backup, passphrase);
  const blob = new Blob([JSON.stringify(content, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(new Date(backup.exportedAt));
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  try {
    localStorage.setItem(LAST_KEY, backup.exportedAt);
  } catch {
    /* ignore */
  }
  return backup;
}

export function lastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Thrown for a file that is not a usable backup; the message is shown to the user. */
export class BackupError extends Error {}

/**
 * Reads and checks a backup file: the format marker, every table, and every row (ids, timestamps,
 * all columns present and valid by the same rules the server applies to synced rows).
 */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a backup (it is not valid JSON).');
  }
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) throw new BackupError('This file is not a Magno Dental Clinic backup.');
  if (b.version !== 1) throw new BackupError('This backup was made by a newer version of the app. Update the app, then restore it.');
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('The backup has no records.');

  const tables: Record<string, AnyRow[]> = {};
  for (const t of SYNC_TABLES) {
    const rows = b.tables[t] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`The backup is damaged (${t}).`);
    tables[t] = rows.map((r, i) => checkRow(t, r, i));
  }
  const counts = Object.fromEntries(SYNC_TABLES.map((t) => [t, tables[t].filter((r) => !r.isDeleted).length]));
  const exportedAt = typeof b.exportedAt === 'string' && !Number.isNaN(Date.parse(b.exportedAt)) ? b.exportedAt : '';
  return { format: BACKUP_FORMAT, version: 1, exportedAt, counts, tables };
}

function checkRow(table: SyncTable, r: unknown, i: number): AnyRow {
  const where = `The backup is damaged (${table}, row ${i + 1})`;
  if (!r || typeof r !== 'object') throw new BackupError(`${where}.`);
  const row = r as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) throw new BackupError(`${where}: no id.`);
  for (const k of ['createdAt', 'updatedAt'] as const) {
    if (typeof row[k] !== 'string' || Number.isNaN(Date.parse(row[k] as string))) throw new BackupError(`${where}: invalid ${k}.`);
  }
  if (typeof row.isDeleted !== 'boolean') throw new BackupError(`${where}: invalid isDeleted.`);
  const out: Record<string, unknown> = {};
  for (const c of [...BASE_COLUMNS, ...TABLE_COLUMNS[table]]) {
    if (!(c in row)) throw new BackupError(`${where}: missing ${c}.`);
    out[c] = row[c];
  }
  const invalid = validateColumns(table, out);
  if (invalid) throw new BackupError(`${where}: ${invalid}.`);
  return out as AnyRow;
}

export interface RestoreResult {
  added: number;
  updated: number;
  /** Already on this device in the same or a newer version. */
  kept: number;
}

/**
 * Merges a backup into this device, never losing newer work: a record missing here is added, a
 * record is replaced only when the backup's copy is newer (`updatedAt`), and anything newer here is
 * kept. This is the same last-write-wins rule sync uses, so with sync on the restored records go to
 * the server and can't overwrite newer changes made on other devices either.
 */
export async function restoreBackup(backup: Backup, db: ClinicDB = defaultDb): Promise<RestoreResult> {
  await requireAdmin();
  const result: RestoreResult = { added: 0, updated: 0, kept: 0 };
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      const table = db.table<AnyRow & { dirty: 0 | 1 }, string>(t);
      const rows = backup.tables[t] ?? [];
      const existing = new Map((await table.bulkGet(rows.map((r) => r.id))).flatMap((r) => (r ? [[r.id, r] as const] : [])));
      const put: (AnyRow & { dirty: 1 })[] = [];
      for (const row of rows) {
        const local = existing.get(row.id);
        // Staff accounts arrive through sync, never from a file: a backup cannot add an account
        // (whose PIN someone else knows) to this device. Existing accounts may be brought up to date.
        if (!local && t === 'staff') continue;
        if (!local) result.added++;
        else if (row.updatedAt > local.updatedAt) result.updated++;
        else {
          result.kept++;
          continue;
        }
        put.push({ ...row, dirty: 1 });
      }
      await table.bulkPut(put);
    }
  });
  return result;
}

/** A chosen file: a checked backup, or an encrypted one waiting for its passphrase. */
export type OpenedBackup = { locked: false; backup: Backup } | { locked: true; envelope: EncryptedBackup };

export async function readBackupFile(file: File): Promise<OpenedBackup> {
  if (file.size > 500 * 1024 * 1024) throw new BackupError('This file is too large to be a backup.');
  const text = await file.text();
  const envelope = encryptedEnvelope(text);
  return envelope ? { locked: true, envelope } : { locked: false, backup: parseBackup(text) };
}
