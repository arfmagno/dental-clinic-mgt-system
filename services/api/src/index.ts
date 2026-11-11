// Composition root: the ONLY place concrete implementations are chosen and wired together.
import { loadConfig } from './config.js';
import { openDriver } from './infrastructure/db/open.js';
import { TokenSigner } from './infrastructure/auth/tokens.js';
import { migrate } from './migrate.js';
import { AuthService, PasswordAuthProvider, type StaffRecord } from './services/authService.js';
import { SyncRepository } from './repositories/syncRepository.js';
import { SyncService } from './services/syncService.js';
import { buildApp } from './http/app.js';

const config = loadConfig();
if (config.env !== 'production' && config.clinicPassword === 'clinic') {
  console.warn('[security] Using the default dev password. Set CLINIC_PASSWORD and AUTH_SECRET before hosting.');
}

const db = openDriver(config.databaseUrl);
await migrate(db, { backupDir: config.backupDir, log: (m) => console.log(`[migrate] ${m}`) });

const auth = new AuthService({
  provider: new PasswordAuthProvider(config.clinicPassword), // swap for a user-account/OIDC provider later
  signer: new TokenSigner(config.authSecret),
  tokenTtlSeconds: config.tokenTtlDays * 86400,
  findStaff: async (id) => (await new SyncRepository(db).get('staff', id)) as StaffRecord | undefined,
});
const app = await buildApp({ config, db, auth, sync: new SyncService(db) });

await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
