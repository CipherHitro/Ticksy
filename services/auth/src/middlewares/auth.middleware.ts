import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

/**
 * requireAuth – answers "who is making this request?"
 *
 * Verifies the RS256 JWT from the Authorization: Bearer header.
 * jose's jwtVerify is async, so this middleware is async too.
 *
 * Does NOT answer "are they allowed to do this?" – that's requireRole's job.
 * Keeping authentication and authorisation separate means routes can compose
 * them independently.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Missing or malformed Authorization header', 401, 'UNAUTHENTICATED'));
  }

  const token = header.split(' ')[1]!;

  try {
    const payload = await verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    next(new AppError('Invalid or expired access token', 401, 'UNAUTHENTICATED'));
  }
}
