import crypto from 'node:crypto';

export interface TokenPayload {
  sub: string; // principal id
  role: string;
  iat: number; // seconds
  exp: number; // seconds
  kind?: 'device' | 'staff'; // absent in tokens issued before staff sign-in existed: a device
}

/** Compact signed bearer token (HMAC-SHA256). Swap for JWT/OIDC validation behind AuthProvider later. */
export class TokenSigner {
  constructor(private secret: string) {}

  sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  verify(token: string, nowSeconds = Math.floor(Date.now() / 1000)): TokenPayload | null {
    const [body, sig, extra] = token.split('.');
    if (!body || !sig || extra !== undefined) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
      if (typeof p.sub !== 'string' || typeof p.role !== 'string' || typeof p.exp !== 'number') return null;
      return p.exp > nowSeconds ? p : null;
    } catch {
      return null;
    }
  }

  private mac(body: string) {
    return crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
