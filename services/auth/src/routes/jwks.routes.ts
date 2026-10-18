import { Router } from 'express';
import { env } from '../config/env.js';
import { getJwks } from '../utils/jwt.js';

const router = Router();

/**
 * GET /.well-known/jwks.json
 *
 * Returns the public RSA key as a JWK Set so other services can verify
 * access tokens without sharing the private key.
 *
 * - Public endpoint (no auth required).
 * - Cache-Control: public, max-age=300 so services can cache and only
 *   refetch when they see an unknown `kid`.
 * - Internal use only – not routed through the public gateway.
 */
router.get('/.well-known/jwks.json', async (_req, res) => {
  const jwks = await getJwks();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(jwks);
});

/**
 * GET /.well-known/openid-configuration
 *
 * Minimal OIDC discovery document.
 * .NET's JwtBearer uses MetadataAddress to fetch this, then reads jwks_uri
 * to auto-fetch and cache the public keys. Without this, you'd need to write
 * a custom IssuerSigningKeyResolver in .NET.
 *
 * Only exposes the two fields .NET actually needs; not a full OIDC server.
 */
router.get('/.well-known/openid-configuration', (_req, res) => {
  // Use the public-facing host from env if available, otherwise guess from request
  const host = env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    issuer:   env.JWT_ISSUER,
    jwks_uri: `${host}/.well-known/jwks.json`,
  });
});

export default router;
