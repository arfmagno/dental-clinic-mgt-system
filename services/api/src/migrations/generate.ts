// Logic behind `npm run migration:new` (kept separate from the CLI so it can be unit tested).
import { MIGRATION_FILE } from './index.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC `YYYYMMDDHHmmss`. */
export function timestampOf(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** "Add patient nickname" / "add_patient_nickname" → "add-patient-nickname". */
export function toKebab(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * File name for a new migration. The version is "now" in UTC, but always later than every existing
 * migration (so a machine with a slow clock cannot create one that sorts before shipped ones).
 */
export function newMigrationFileName(description: string, ext: 'sql' | 'ts', existing: string[], now = new Date()): string {
  const slug = toKebab(description);
  if (!slug) throw new Error('Give the migration a description, e.g. npm run migration:new -- add-patient-nickname');
  if (slug.length > 60) throw new Error('Keep the description under 60 characters');
  const latest = existing.map((f) => MIGRATION_FILE.exec(f)?.[1]).filter(Boolean).sort().at(-1);
  let version = timestampOf(now);
  if (latest && version <= latest) {
    const t = Date.UTC(+latest.slice(0, 4), +latest.slice(4, 6) - 1, +latest.slice(6, 8), +latest.slice(8, 10), +latest.slice(10, 12), +latest.slice(12, 14));
    version = timestampOf(new Date(t + 1000));
  }
  return `${version}-${slug}.${ext}`;
}

export function migrationTemplate(ext: 'sql' | 'ts', description: string): string {
  if (ext === 'sql') {
    return `-- ${description}
-- Runs once, inside a transaction, before the server starts. Keep it portable (see infrastructure/db/driver.ts).
-- Synced tables need: id TEXT PRIMARY KEY, createdAt, updatedAt, isDeleted INTEGER NOT NULL DEFAULT 0,
-- serverSeq INTEGER NOT NULL, and an index on serverSeq. Prefer ADD COLUMN ... DEFAULT ... (additive).
-- To change existing synced rows so devices receive the change, use a .ts migration with ctx.backfill.

`;
  }
  return `import type { MigrationContext } from './types.js';

/**
 * ${description}
 * Use a .ts migration only when SQL is not enough (data transforms in code, backfills that devices
 * must pull). Runs once, inside a transaction.
 */
export async function up(ctx: MigrationContext): Promise<void> {
  await ctx.db.exec(\`\`);
}
`;
}
