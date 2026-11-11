import crypto from 'node:crypto';
import { isRole, type Principal } from '../domain/authorization.js';
import { AuthError } from '../domain/errors.js';
import { pinMatches, type StoredPin } from '../infrastructure/auth/pin.js';
import type { TokenSigner } from '../infrastructure/auth/tokens.js';

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
  // The shared password identifies a clinic device, not a person: least privilege (syncs records;
  // staff accounts need a staff sign-in on top, see AuthService.staffLogin).
  constructor(password: string, private principal: Principal = { id: 'clinic', role: 'staff', kind: 'device' }) {
    this.digest = sha256(password);
  }
  async authenticate(credentials: Credentials) {
    const given = typeof credentials.password === 'string' ? credentials.password : '';
    // Compare fixed-length digests in constant time.
    return crypto.timingSafeEqual(sha256(given), this.digest) ? this.principal : null;
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();

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

/** A staff account as the server has it (synced from the clinic's devices). */
export interface StaffRecord extends StoredPin {
  id: string;
  role: string;
  isDeleted: boolean;
}

export interface AuthServiceOptions {
  provider: AuthProvider;
  signer: TokenSigner;
  tokenTtlSeconds: number;
  throttle?: LoginThrottle;
  /** Looks up a staff account for staff sign-in. */
  findStaff?: (id: string) => Promise<StaffRecord | undefined>;
  /** Staff sessions are short: a working day. */
  staffTokenTtlSeconds?: number;
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
    return this.issue(principal, this.o.tokenTtlSeconds);
  }

  /**
   * A staff member signs in with their own PIN, from a device that already holds a clinic token.
   * The PIN is checked against the hash on the server's copy of their staff row. Throttled per
   * account and client, with the same answer for unknown accounts and wrong PINs.
   */
  async staffLogin(staffId: string, pin: string, clientKey: string) {
    const key = `staff:${clientKey}:${staffId}`;
    this.throttle.check(key);
    const staff = await this.o.findStaff?.(staffId);
    const ok = !!staff && !staff.isDeleted && isRole(staff.role) && (await pinMatches(pin, staff));
    if (!ok || !staff) {
      this.throttle.fail(key);
      throw new AuthError('Invalid credentials', 401);
    }
    this.throttle.succeed(key);
    return this.issue({ id: staff.id, role: staff.role as Principal['role'], kind: 'staff' }, this.o.staffTokenTtlSeconds ?? 12 * 3600);
  }

  private issue(principal: Principal, ttlSeconds: number) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ttlSeconds;
    return { token: this.o.signer.sign({ sub: principal.id, role: principal.role, kind: principal.kind, iat, exp }), expiresAt: exp * 1000, principal };
  }

  /** Returns the principal for a bearer token, or null when missing/invalid/expired. */
  verify(token: string | undefined): Principal | null {
    if (!token) return null;
    const p = this.o.signer.verify(token);
    if (!p || !isRole(p.role)) return null;
    return { id: p.sub, role: p.role, kind: p.kind === 'staff' ? 'staff' : 'device' };
  }
}
