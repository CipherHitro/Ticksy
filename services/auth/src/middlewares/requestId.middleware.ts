import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Reads X-Request-Id from the incoming request or generates a new UUID.
 * Echoes the value back in the response header and attaches it to req.requestId
 * so it can flow into logs and error bodies.
 *
 * Per AGENTS.md §5.7 – every service must read, echo, and propagate the request ID.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
