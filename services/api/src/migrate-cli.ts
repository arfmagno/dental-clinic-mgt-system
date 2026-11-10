// `npm run migrate -w @clinic/server` — applies pending migrations without starting the server.
import { loadConfig } from './config.js';
import { openDriver } from './infra/db/open.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = openDriver(config.databaseUrl);
const applied = await migrate(db, { backupDir: config.backupDir, log: console.log });
console.log(applied.length ? `Done. Applied ${applied.length} migration(s).` : 'Database is up to date.');
await db.close();
