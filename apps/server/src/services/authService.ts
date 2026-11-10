import crypto from 'node:crypto';
import { TokenSigner } from '../infra/auth/tokens.js';

// ---------- Authorization model ----------
// Authorization is permission-based; roles are just named bundles of permissions.
// To add a role (e.g. a patient portal), extend this table. Handlers never check roles directly.
export type Role = 'admin' | 'staff' | 'patient';
export type Permission = 'sync:pull' | 'sync:push';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['sync:pull', 'sync:push'],
  staff: ['sync:pull', 'sync:push'],
  // Future patient portal: patients must only ever see their OWN rows. Do not grant sync:* here;
  // give patients dedicated, row-scoped endpoints instead (see docs/ARCHITECTURE.md).
  patient: [],
};

export interface Principal {
  id: string;
  role: Role;
}

export const can = (p: Principal, permission: Permission) => ROLE_PERMISSIONS[p.role]?.includes(permission) ?? false;

// ---------- Authentication port ----------
export type Credentials = Record<string, unknown>;

/**
 * How a person proves who they are. Today: one shared clinic password.
 * Later: user accounts (username + hashed password), magic links, or an OIDC provider —
 * implement this interface and pass it to AuthService; nothing else changes.
 */
export interface AuthProvider {
  authenticate(credentials: Credentials): Promise<Principal | null>;
}

export class PasswordAuthProvider implements AuthProvider {
  private digest: Buffer;
  constructor(password: string, private principal: Principal = { id: 'clinic', role: 'admin' }) {
    this.digest = sha256(password);
  }
  async authenticate(credentials: Credentials) {
    const given = typeof credentials.password === 'string' ? credentials.password : '';
    // Compare fixed-length digests in constant time.
    return crypto.timingSafeEqual(sha256(given), this.digest) ? this.principal : null;
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 429, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/**
 * Failed-login throttle. In-memory: correct for one instance; move to the database or a shared
 * cache if the server is ever scaled horizontally.
 */
export class LoginThrottle {
  private failures = new Map<string, { count: number; first: number }>();
  constructor(private max = 8, private windowMs = 15 * 60 * 1000, private now: () => number = Date.now) {}

  check(key: string) {
    const f = this.failures.get(key);
    if (!f) return;
    if (this.now() - f.first > this.windowMs) return void this.failures.delete(key);
    if (f.count >= this.max) {
      throw new AuthError('Too many attempts. Try again later.', 429, Math.ceil((f.first + this.windowMs - this.now()) / 1000));
    }
  }
  fail(key: string) {
    const f = this.failures.get(key);
    if (!f || this.now() - f.first > this.windowMs) this.failures.set(key, { count: 1, first: this.now() });
    else f.count++;
  }
  succeed(key: string) {
    this.failures.delete(key);
  }
}

export interface AuthServiceOptions {
  provider: AuthProvider;
  signer: TokenSigner;
  tokenTtlSeconds: number;
  throttle?: LoginThrottle;
}

export class AuthService {
  private throttle: LoginThrottle;
  constructor(private o: AuthServiceOptions) {
    this.throttle = o.throttle ?? new LoginThrottle();
  }

  async login(credentials: Credentials, clientKey: string) {
    this.throttle.check(clientKey);
    const principal = await this.o.provider.authenticate(credentials);
    if (!principal) {
      this.throttle.fail(clientKey);
      throw new AuthError('Invalid credentials', 401); // same message regardless of cause
    }
    this.throttle.succeed(clientKey);
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.o.tokenTtlSeconds;
    return { token: this.o.signer.sign({ sub: principal.id, role: principal.role, iat, exp }), expiresAt: exp * 1000, principal };
  }

  /** Returns the principal for a bearer token, or null when missing/invalid/expired. */
  verify(token: string | undefined): Principal | null {
    if (!token) return null;
    const p = this.o.signer.verify(token);
    if (!p || !(p.role in ROLE_PERMISSIONS)) return null;
    return { id: p.sub, role: p.role as Role };
  }
}
