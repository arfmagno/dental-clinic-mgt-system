import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app.js';
import { loginSchema, staffLoginSchema, type LoginBody, type StaffLoginBody } from '../validators/auth.schema.js';

export const authRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.post<{ Body: LoginBody }>('/auth/login', { config: { auth: 'public' }, schema: loginSchema }, async (req) => {
    const { token, expiresAt, principal } = await deps.auth.login({ ...req.body }, req.ip);
    return { token, expiresAt, role: principal.role };
  });

  // Needs a clinic token first (auth: 'any'): a PIN alone never reaches patient data.
  app.post<{ Body: StaffLoginBody }>('/auth/staff', { config: { auth: 'any' }, schema: staffLoginSchema }, async (req) => {
    const { token, expiresAt, principal } = await deps.auth.staffLogin(req.body.staffId, req.body.pin, req.ip);
    return { token, expiresAt, role: principal.role };
  });

  app.get('/auth/me', { config: { auth: 'any' } }, async (req) => ({ id: req.principal!.id, role: req.principal!.role, kind: req.principal!.kind }));
};
