// npm run migration:new -- <description> [--ts]
// Creates src/migrations/<UTC YYYYMMDDHHmmss>-<kebab-description>.sql (or .ts with --ts).
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MIGRATIONS_DIR } from '../src/migrations/index.js';
import { migrationTemplate, newMigrationFileName } from '../src/migrations/generate.js';

const args = process.argv.slice(2);
const ext = args.includes('--ts') ? 'ts' : 'sql';
const description = args.filter((a) => !a.startsWith('--')).join(' ');

try {
  const file = newMigrationFileName(description, ext, await readdir(MIGRATIONS_DIR));
  const full = path.join(MIGRATIONS_DIR, file);
  await writeFile(full, migrationTemplate(ext, description), { flag: 'wx' });
  console.log(`Created ${path.relative(process.cwd(), full)}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
