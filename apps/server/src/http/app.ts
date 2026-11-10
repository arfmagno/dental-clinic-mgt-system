import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Config } from '../config.js';
import type { SqlDriver } from '../infra/db/driver.js';
import { AuthError, can, type AuthService, type Permission, type Principal } from '../services/authService.js';
import type { SyncService } from '../services/syncService.js';
import { ValidationError } from '../services/syncService.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { syncRoutes } from './routes/sync.js';

/**
 * Every /api route MUST declare how it is protected in its route config. A route that declares
 * nothing is rejected (fail closed), so a forgotten check can never expose data.
 *   'public'   no credentials (login, health)
 *   'any'      any authenticated principal
 *   <perm>     authenticated AND the role grants this permission
 */
export type RouteAuth = 'public' | 'any' | Permission;

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: RouteAuth;
  }
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface AppDeps {
  config: Config;
  db: SqlDriver;
  auth: AuthService;
  sync: SyncService;
}

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

  // ----- security headers -----
  app.addHook('onSend', async (_req, reply) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      // camera is needed for patient photo capture; everything else is off.
      'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
      'content-security-policy':
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (config.env === 'production') reply.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
    if (_req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  if (config.corsOrigin) await app.register(cors, { origin: config.corsOrigin, methods: ['GET', 'POST'] });

  // ----- authentication + authorization gate (default deny) -----
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return; // static assets are public
    const rule = req.routeOptions.config?.auth;
    if (rule === 'public') return;
    if (!rule) return reply.code(403).send({ error: 'forbidden' }); // route forgot to declare protection
    const header = req.headers.authorization;
    const principal = deps.auth.verify(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!principal) return reply.code(401).send({ error: 'unauthorized' });
    if (rule !== 'any' && !can(principal, rule)) return reply.code(403).send({ error: 'forbidden' });
    req.principal = principal;
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof AuthError) {
      if (err.retryAfterSeconds) reply.header('retry-after', err.retryAfterSeconds);
      return reply.code(err.status).send({ error: err.message });
    }
    if (err instanceof ValidationError || err.validation) return reply.code(400).send({ error: 'invalid request' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal error' }); // never leak internals
  });

  // ----- routes (thin: parse -> call service -> shape response) -----
  await app.register(
    async (api) => {
      await api.register(healthRoutes, deps);
      await api.register(authRoutes, deps);
      await api.register(syncRoutes, deps);
    },
    { prefix: '/api/v1' },
  );

  // ----- single-container hosting: serve the built web app -----
  const webDir = config.webDir ? path.resolve(config.webDir) : '';
  if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDir,
      setHeaders(res, filePath) {
        // The shell and service worker must revalidate so updates reach installed apps; hashed assets are immutable.
        const base = path.basename(filePath);
        if (base === 'index.html' || base === 'sw.js' || base === 'manifest.webmanifest' || base.startsWith('workbox-')) {
          res.header('cache-control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('cache-control', 'public, max-age=31536000, immutable');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html'); // SPA fallback
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
