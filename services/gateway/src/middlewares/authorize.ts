import type { Request, Response, NextFunction } from 'express';

export function authorizeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const route = req.matchedRoute;
  if (!route || !route.roles) {
    next();
    return;
  }

  // If roles are required, caller must have been authenticated
  if (!req.user) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required to access this resource',
      requestId: req.requestId || 'unknown',
    });
    return;
  }

  // Any authenticated role allowed
  if (route.roles === 'any') {
    next();
    return;
  }

  // Specific roles required
  if (Array.isArray(route.roles)) {
    if (!route.roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: `Forbidden: role '${req.user.role}' is not authorized to access this endpoint`,
        requestId: req.requestId || 'unknown',
      });
      return;
    }
  }

  next();
}
