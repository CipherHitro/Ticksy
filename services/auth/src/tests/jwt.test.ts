import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { SignJWT, exportJWK, importPKCS8 } from 'jose';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test key pair (never committed to git, generated in-memory)
// Tests that need HTTP endpoints use process.env to point the service at
// test keys per AGENTS.md §6.8.
// ─────────────────────────────────────────────────────────────────────────────

describe('JWT / JWKS contract', () => {
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    publicKeyPem  = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  });

  it('generates a 2048-bit RSA key pair', () => {
    expect(privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
  });

  it('signs an RS256 token that verifies with the public key', async () => {
    const { jwtVerify, importSPKI } = await import('jose');
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const publicKey  = await importSPKI(publicKeyPem, 'RS256');

    const token = await new SignJWT({ sub: 'user-1', role: 'ATTENDEE', email: 'a@b.com', name: 'A' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setIssuer('ticksy-auth')
      .setAudience('ticksy-api')
      .setExpirationTime('15m')
      .sign(privateKey);

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer:     'ticksy-auth',
      audience:   'ticksy-api',
    });

    expect(payload.sub).toBe('user-1');
    expect(payload['role']).toBe('ATTENDEE');
  });

  it('rejects a token signed with the wrong key', async () => {
    const { jwtVerify, importSPKI } = await import('jose');

    // Grab the public key from the ORIGINAL beforeAll pair
    const legitPubKey = await importSPKI(publicKeyPem, 'RS256');

    // Generate a SEPARATE private key and sign a token with it
    const { privateKey: altPrivKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const altPrivPem = altPrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const altPrivKeyJose = await importPKCS8(altPrivPem, 'RS256');

    const tampered = await new SignJWT({ sub: 'evil', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setIssuer('ticksy-auth')
      .setAudience('ticksy-api')
      .setExpirationTime('15m')
      .sign(altPrivKeyJose);

    // Verifying with the ORIGINAL public key should reject because
    // the token was signed with a completely different private key
    await expect(
      jwtVerify(tampered, legitPubKey, { algorithms: ['RS256'], issuer: 'ticksy-auth', audience: 'ticksy-api' })
    ).rejects.toThrow();
  });

  it('rejects a token with wrong audience', async () => {
    const { jwtVerify, importSPKI } = await import('jose');
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const publicKey  = await importSPKI(publicKeyPem, 'RS256');

    const token = await new SignJWT({ sub: 'user-2' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setIssuer('ticksy-auth')
      .setAudience('wrong-api') // intentionally wrong
      .setExpirationTime('15m')
      .sign(privateKey);

    await expect(
      jwtVerify(token, publicKey, { algorithms: ['RS256'], issuer: 'ticksy-auth', audience: 'ticksy-api' })
    ).rejects.toThrow();
  });

  it('exports a JWK with the required JWKS fields', async () => {
    const { importSPKI } = await import('jose');
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    const jwk = await exportJWK(publicKey);

    const entry = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid: 'test-kid', use: 'sig', alg: 'RS256' };

    expect(entry.kty).toBe('RSA');
    expect(entry.n).toBeTruthy();
    expect(entry.e).toBeTruthy();
    expect(entry.kid).toBe('test-kid');
    expect(entry.use).toBe('sig');
    expect(entry.alg).toBe('RS256');
  });
});
