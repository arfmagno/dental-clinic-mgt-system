// Part of `npm run lint`: migration file names, versions, and that every .sql file is non-empty.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MIGRATIONS_DIR, MIGRATION_FILE, checkMigrationFiles } from '../src/migrations/index.js';

const files = (await readdir(MIGRATIONS_DIR)).sort();
const problems = checkMigrationFiles(files);
for (const f of files.filter((f) => MIGRATION_FILE.exec(f)?.[3] === 'sql')) {
  const sql = (await readFile(path.join(MIGRATIONS_DIR, f), 'utf8')).replace(/--.*$/gm, '').trim();
  if (!sql) problems.push({ file: f, problem: 'contains no SQL statements' });
}
if (problems.length) {
  for (const p of problems) console.error(`migrations/${p.file}: ${p.problem}`);
  process.exit(1);
}
console.log(`migrations: ${files.filter((f) => MIGRATION_FILE.test(f)).length} files OK`);
