import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import type { Role } from '../types/auth.types.js';

let remoteJWKSet: ReturnType<typeof createRemoteJWKSet> | null = null;

export function getRemoteJWKSet(): ReturnType<typeof createRemoteJWKSet> {
  if (!remoteJWKSet) {
    remoteJWKSet = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL), {
      cooldownDuration: 60000, // On unknown kid, refetch at most once per minute
      cacheMaxAge: 300000,     // Cache keys for at least 5 minutes
    });
  }
  return remoteJWKSet;
}

export function setRemoteJWKSet(jwks: ReturnType<typeof createRemoteJWKSet> | null): void {
  remoteJWKSet = jwks;
}

export async function authenticateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const route = req.matchedRoute;
  if (!route) {
    next();
    return;
  }

  // 1. Public route: no token check required
  if (route.authMode === 'public') {
    next();
    return;
  }

  const authHeader = req.header('authorization');

  // 2. Token absent
  if (!authHeader) {
    if (route.authMode === 'optional') {
      // Continue anonymously
      next();
      return;
    }

    res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'Authorization token is required for this route',
      requestId: req.requestId || 'unknown',
    });
    return;
  }

  // 3. Token present: validate format
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'Invalid authorization header format (expected Bearer <token>)',
      requestId: req.requestId || 'unknown',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'Authorization token is empty',
      requestId: req.requestId || 'unknown',
    });
    return;
  }

  try {
    const JWKS = getRemoteJWKSet();
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ['RS256'],
    });

    req.user = {
      userId: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
      iss: payload.iss as string,
      aud: payload.aud as string,
    };

    next();
  } catch (_err) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'Invalid or expired authorization token',
      requestId: req.requestId || 'unknown',
    });
  }
}
