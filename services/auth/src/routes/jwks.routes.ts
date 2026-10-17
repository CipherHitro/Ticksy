import { Router } from 'express';
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

export default router;
