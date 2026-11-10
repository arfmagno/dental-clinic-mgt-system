import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Migration, MigrationModule } from './types.js';

/**
 * Migrations are files in this folder named `<UTC YYYYMMDDHHmmss>-<kebab-case-description>.<sql|ts>`,
 * e.g. `20261111090000-single-address.ts`. Create one with `npm run migration:new -- <description>`.
 *
 *  - `.sql`  plain schema/data SQL, run as-is inside the migration's transaction (the default)
 *  - `.ts`   exports `up(ctx)`, for changes that need code (e.g. transforms shared with the device)
 *
 * Never edit, rename or delete a migration that has shipped. See docs/MIGRATIONS.md.
 */
export const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATION_FILE = /^(\d{14})-([a-z0-9]+(?:-[a-z0-9]+)*)\.(sql|ts)$/;

/** Files in the folder that are not migrations. Anything else starting with a digit must match the pattern. */
const SUPPORT_FILES = new Set(['index.ts', 'types.ts', 'generate.ts']);

export interface MigrationFileProblem {
  file: string;
  problem: string;
}

/** Checks names and versions without loading anything (used by `npm run lint` and the loader). */
export function checkMigrationFiles(files: string[]): MigrationFileProblem[] {
  const problems: MigrationFileProblem[] = [];
  const versions = new Map<string, string>();
  for (const file of files) {
    if (SUPPORT_FILES.has(file) || file.endsWith('.md')) continue;
    const m = MIGRATION_FILE.exec(file);
    if (!m) {
      problems.push({ file, problem: 'name must be <YYYYMMDDHHmmss>-<kebab-case>.sql or .ts' });
      continue;
    }
    const [, version] = m;
    const iso = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}T${version.slice(8, 10)}:${version.slice(10, 12)}:${version.slice(12, 14)}Z`;
    if (Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 19) !== iso.slice(0, 19)) {
      problems.push({ file, problem: `${version} is not a valid UTC timestamp` });
    }
    const other = versions.get(version);
    if (other) problems.push({ file, problem: `duplicate version ${version} (also ${other})` });
    versions.set(version, file);
  }
  return problems;
}

/** Loads every migration file in `dir`, sorted by version. Throws on any naming problem. */
export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).sort();
  const problems = checkMigrationFiles(files);
  if (problems.length) throw new Error(`Bad migration files:\n${problems.map((p) => `  ${p.file}: ${p.problem}`).join('\n')}`);

  const out: Migration[] = [];
  for (const file of files) {
    const m = MIGRATION_FILE.exec(file);
    if (!m) continue;
    const [, version, slug, ext] = m;
    const full = path.join(dir, file);
    const name = slug.replace(/-/g, ' ');
    if (ext === 'sql') {
      const sql = await readFile(full, 'utf8');
      out.push({ version, name, file, up: async ({ db }) => db.exec(sql) });
    } else {
      const mod = (await import(pathToFileURL(full).href)) as Partial<MigrationModule>;
      if (typeof mod.up !== 'function') throw new Error(`${file} must export an async function up(ctx)`);
      out.push({ version, name, file, up: mod.up });
    }
  }
  return out;
}

/**
 * Databases created before timestamped file names recorded integer ids. Their equivalents, so
 * those databases are recognised as already migrated.
 */
export const LEGACY_VERSIONS: Readonly<Record<number, string>> = {
  1: '20261110090000',
  2: '20261110120000',
};
