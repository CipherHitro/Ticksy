import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../utils/AppError.js';

/**
 * Usage: router.post('/events', requireAuth, requireRole('ORGANIZER'), createEvent)
 *
 * requireAuth must always run before requireRole so req.user is populated.
 * Keeping auth (identity) and authz (permission) separate means routes can
 * compose them independently.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // requireAuth should always run first; this is a safety net.
      return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Role '${req.user.role}' is not permitted to perform this action`,
          403,
          'FORBIDDEN',
        ),
      );
    }

    next();
  };
}
