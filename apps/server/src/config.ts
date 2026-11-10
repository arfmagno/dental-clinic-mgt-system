/**
 * All deployment-specific settings come from environment variables (12-factor).
 * Nothing else in the codebase reads process.env.
 */
export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** sqlite:./data/clinic.db | sqlite::memory: | postgres://... (adapter not built yet) */
  databaseUrl: string;
  /** Where pre-migration backups go (file databases only). */
  backupDir: string;
  clinicPassword: string;
  authSecret: string;
  tokenTtlDays: number;
  /** Built web app to serve (single-container deploy). Empty string disables static serving. */
  webDir: string;
  /** Allowed browser origin when the web app is hosted separately (e.g. a CDN). Empty = same-origin only. */
  corsOrigin: string;
  /** Set true when behind a reverse proxy / PaaS so client IPs (login throttling) are correct. */
  trustProxy: boolean;
  logLevel: string;
}

export function loadConfig(e: Record<string, string | undefined> = process.env): Config {
  const env = (e.NODE_ENV as Config['env']) || 'development';
  const dataDir = e.DATA_DIR ?? 'data';
  const cfg: Config = {
    env,
    host: e.HOST ?? '0.0.0.0',
    port: Number(e.PORT ?? 3001),
    databaseUrl: e.DATABASE_URL ?? `sqlite:${dataDir}/clinic.db`,
    backupDir: e.BACKUP_DIR ?? `${dataDir}/backups`,
    clinicPassword: e.CLINIC_PASSWORD ?? 'clinic',
    authSecret: e.AUTH_SECRET ?? 'dev-secret-change-me',
    tokenTtlDays: Number(e.TOKEN_TTL_DAYS ?? 30),
    webDir: e.WEB_DIR ?? '../web/dist',
    corsOrigin: e.CORS_ORIGIN ?? '',
    trustProxy: e.TRUST_PROXY === 'true',
    logLevel: e.LOG_LEVEL ?? (env === 'test' ? 'silent' : 'info'),
  };
  if (env === 'production') {
    const missing = [!e.CLINIC_PASSWORD && 'CLINIC_PASSWORD', !e.AUTH_SECRET && 'AUTH_SECRET'].filter(Boolean);
    if (missing.length) throw new Error(`Missing required env in production: ${missing.join(', ')}`);
    if (cfg.authSecret.length < 24) throw new Error('AUTH_SECRET must be at least 24 characters');
  }
  return cfg;
}
