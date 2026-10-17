import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SignJWT, importPKCS8, importSPKI, jwtVerify, exportJWK } from 'jose';
import { env } from '../config/env.js';
import type { AccessTokenPayload } from '../types/jwt.types.js';
import { logger } from '../config/logger.js';

// Load key material once at startup; fail fast if the files are missing.
const privatePem = readFileSync(resolve(env.JWT_PRIVATE_KEY_PATH), 'utf8');
const publicPem  = readFileSync(resolve(env.JWT_PUBLIC_KEY_PATH),  'utf8');

// importPKCS8/importSPKI are async but we need them synchronously at module
// load. We resolve via a top-level async IIFE and export a promise that all
// callers can await. This keeps the file tree simple – no class, no init()
// function to call.
const keysReady = (async () => {
  const privateKey = await importPKCS8(privatePem, 'RS256');
  const publicKey  = await importSPKI(publicPem,   'RS256');
  const publicJwk  = await exportJWK(publicKey);
  return { privateKey, publicKey, publicJwk };
})();

keysReady.catch((err) => {
  logger.fatal({ err }, 'Failed to load RSA keys – check JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH');
  process.exit(1);
});

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const { privateKey } = await keysReady;

  return new SignJWT({
    sub:   payload.sub,
    email: payload.email,
    name:  payload.name,
    role:  payload.role,
  })
    .setProtectedHeader({ alg: 'RS256', kid: env.JWT_KEY_ID })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { publicKey } = await keysReady;

  const { payload } = await jwtVerify(token, publicKey, {
    algorithms:   ['RS256'],
    issuer:       env.JWT_ISSUER,
    audience:     env.JWT_AUDIENCE,
    clockTolerance: 30, // seconds of clock-skew tolerance
  });

  // Validate required claims are present
  if (!payload.sub || !payload.email || !payload.role) {
    throw new Error('Token missing required claims');
  }

  return {
    sub:   payload.sub,
    email: payload.email as string,
    name:  payload.name  as string,
    role:  payload.role  as AccessTokenPayload['role'],
  };
}

/** Returns the public key as a JWK Set document for /.well-known/jwks.json */
export async function getJwks(): Promise<{ keys: object[] }> {
  const { publicJwk } = await keysReady;
  return {
    keys: [
      {
        kty: publicJwk.kty,
        n:   publicJwk.n,
        e:   publicJwk.e,
        kid: env.JWT_KEY_ID,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}
