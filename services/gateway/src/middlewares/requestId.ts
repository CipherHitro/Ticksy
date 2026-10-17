import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId && incomingId.trim().length > 0 ? incomingId.trim() : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
