import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app.js';
import { pullSchema, pushSchema, type PullQuery, type PushBody } from '../validators/sync.schema.js';

export const syncRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.post<{ Body: PushBody }>('/sync/push', { config: { auth: 'sync:push' }, schema: pushSchema }, async (req) =>
    deps.sync.push(req.principal!, req.body),
  );

  app.get<{ Querystring: PullQuery }>('/sync/pull', { config: { auth: 'sync:pull' }, schema: pullSchema }, async (req) =>
    deps.sync.pull(req.query.since, req.query.limit),
  );
};
