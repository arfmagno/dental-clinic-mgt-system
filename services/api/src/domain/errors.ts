// Domain errors. Services throw these; the HTTP error middleware maps them to status codes.

/** Input breaks a domain rule (bad row, bad value). → 400 */
export class ValidationError extends Error {}

/** Authentication failed (401) or is throttled (429). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 429,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
