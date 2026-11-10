import type { FastifyInstance } from 'fastify';
import { can, type Permission, type Principal } from '../../domain/authorization.js';
import type { AuthService } from '../../services/authService.js';

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

/** Authentication + authorization gate (default deny). Sets req.principal for protected routes. */
export function authGate(app: FastifyInstance, auth: AuthService) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return; // static assets are public
    const rule = req.routeOptions.config?.auth;
    if (rule === 'public') return;
    if (!rule) return reply.code(403).send({ error: 'forbidden' }); // route forgot to declare protection
    const header = req.headers.authorization;
    const principal = auth.verify(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!principal) return reply.code(401).send({ error: 'unauthorized' });
    if (rule !== 'any' && !can(principal, rule)) return reply.code(403).send({ error: 'forbidden' });
    req.principal = principal;
  });
}
