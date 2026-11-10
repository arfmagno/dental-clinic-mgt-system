import type { FastifyInstance } from 'fastify';

/** Security headers on every response; API responses are never cached. */
export function securityHeaders(app: FastifyInstance, opts: { hsts: boolean }) {
  app.addHook('onSend', async (req, reply) => {
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
    if (opts.hsts) reply.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });
}
