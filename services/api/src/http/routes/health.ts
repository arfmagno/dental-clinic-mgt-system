import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app.js';
import { SyncRepository } from '../../repositories/syncRepository.js';

/** Liveness/readiness for the host (load balancer, Docker, Fly, Render...). Reveals nothing sensitive. */
export const healthRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.get('/healthz', { config: { auth: 'public' } }, async (_req, reply) => {
    try {
      await new SyncRepository(deps.db).ping();
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
};
