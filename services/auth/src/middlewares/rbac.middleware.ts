import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../utils/AppError.js';

// Usage: router.post('/events', requireAuth, requireRole(Role.ORGANIZER), createEvent)
//
// This is how the Catalog/Booking services will also gate organizer-only
// actions (e.g. "create event", "cancel event") once you build them -
// same pattern, just re-implemented per service since each service
// verifies the JWT independently (no shared session store).
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      // requireAuth should always run first; this is a safety net.
      return next(new AppError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Role '${req.user.role}' is not permitted to perform this action`,
          403,
        ),
      );
    }

    next();
  };
}
