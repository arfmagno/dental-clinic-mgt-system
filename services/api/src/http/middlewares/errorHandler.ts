import type { FastifyInstance } from 'fastify';
import { AuthError, ValidationError } from '../../domain/errors.js';

/** Maps domain errors to status codes. Unexpected errors are logged and answered with a bare 500. */
export function errorHandler(app: FastifyInstance) {
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
}
