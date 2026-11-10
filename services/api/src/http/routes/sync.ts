import type { FastifyPluginAsync } from 'fastify';
import type { PushRequest } from '@clinic/shared';
import type { AppDeps } from '../app.js';

export const syncRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.post(
    '/sync/push',
    {
      config: { auth: 'sync:push' },
      schema: {
        body: {
          type: 'object',
          required: ['changes'],
          additionalProperties: false,
          properties: { changes: { type: 'object' } },
        },
      },
    },
    async (req) => deps.sync.push(req.body as PushRequest),
  );

  app.get(
    '/sync/pull',
    {
      config: { auth: 'sync:pull' },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            since: { type: 'integer', minimum: 0, default: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 1000, default: 500 },
          },
        },
      },
    },
    async (req) => {
      const { since, limit } = req.query as { since: number; limit: number };
      return deps.sync.pull(since, limit);
    },
  );
};
