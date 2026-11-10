import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app.js';

export const authRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.post(
    '/auth/login',
    {
      config: { auth: 'public' },
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', minLength: 1, maxLength: 200 } },
        },
      },
    },
    async (req) => {
      const { token, expiresAt, principal } = await deps.auth.login(req.body as Record<string, unknown>, req.ip);
      return { token, expiresAt, role: principal.role };
    },
  );

  app.get('/auth/me', { config: { auth: 'any' } }, async (req) => ({ id: req.principal!.id, role: req.principal!.role }));
};
