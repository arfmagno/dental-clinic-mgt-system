// npm run reset-pin -w @clinic/server -- "<staff name or id>" <new PIN>
// For the server operator when nobody with an admin account can sign in. Every device receives the
// new PIN on its next sync; tell the person, and have them change it under Settings → Account.
import { loadConfig } from '../src/config.js';
import { openDriver } from '../src/infrastructure/db/open.js';
import { migrate } from '../src/migrate.js';
import { resetStaffPin } from '../src/staffAdmin.js';

const [who, pin] = process.argv.slice(2);
if (!who || !pin) {
  console.error('Usage: npm run reset-pin -w @clinic/server -- "<staff name or id>" <new PIN>');
  process.exit(1);
}
const config = loadConfig();
const db = openDriver(config.databaseUrl);
await migrate(db, { backupDir: config.backupDir, log: () => {} });
try {
  const s = await resetStaffPin(db, who, pin);
  console.log(`New PIN set for ${s.name} (${s.role}). Devices receive it on their next sync.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.close();
}
