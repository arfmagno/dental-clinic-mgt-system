import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Config } from '../config.js';
import type { SqlDriver } from '../infrastructure/db/driver.js';
import type { AuthService } from '../services/authService.js';
import type { SyncService } from '../services/syncService.js';
import { authGate } from './middlewares/authGate.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { securityHeaders } from './middlewares/securityHeaders.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { syncRoutes } from './routes/sync.js';
import { serveWebApp } from './webApp.js';

export interface AppDeps {
  config: Config;
  db: SqlDriver;
  auth: AuthService;
  sync: SyncService;
}

/** Wiring only: middlewares, then routes under /api/v1, then the web app. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Never write credentials or patient payloads to logs.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 25 * 1024 * 1024, // compressed patient photos travel inside sync pushes
  });

  securityHeaders(app, { hsts: config.env === 'production' });
  if (config.corsOrigin) await app.register(cors, { origin: config.corsOrigin, methods: ['GET', 'POST'] });
  authGate(app, deps.auth);
  errorHandler(app);

  // Routes are thin: validated input -> service -> response.
  await app.register(
    async (api) => {
      await api.register(healthRoutes, deps);
      await api.register(authRoutes, deps);
      await api.register(syncRoutes, deps);
    },
    { prefix: '/api/v1' },
  );

  await serveWebApp(app, config.webDir);
  return app;
}
