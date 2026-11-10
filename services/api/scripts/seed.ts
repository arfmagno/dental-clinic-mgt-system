// npm run seed            — add ~60 sample patients with visits and payments to the server database
// npm run seed -- --remove — soft-delete them again (devices drop them on their next sync)
// Refuses to run when NODE_ENV=production.
import { SYNC_TABLES } from '@clinic/shared';
import { loadConfig } from '../src/config.js';
import { openDriver } from '../src/infra/db/open.js';
import { migrate } from '../src/migrate.js';
import { seedDemo, unseedDemo } from '../src/seed.js';

const config = loadConfig();
if (config.env === 'production') {
  console.error('Refusing to seed sample data into a production database.');
  process.exit(1);
}
const remove = process.argv.includes('--remove');
const db = openDriver(config.databaseUrl);
await migrate(db, { backupDir: config.backupDir, log: console.log });
const res = await (remove ? unseedDemo(db) : seedDemo(db));
for (const t of SYNC_TABLES) console.log(`${t.padEnd(18)} ${res.accepted[t]?.length ?? 0} written, ${res.stale[t]?.length ?? 0} unchanged`);
if (res.rejected.length) {
  console.error('Rejected:', res.rejected.slice(0, 5));
  process.exitCode = 1;
}
console.log(remove ? 'Sample data removed.' : 'Sample data loaded. Devices receive it on their next sync.');
await db.close();
