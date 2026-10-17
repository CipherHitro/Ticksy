import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

/**
 * Central error handler – the ONLY place that writes error responses.
 * Every error path must ultimately pass through here via next(err).
 *
 * Output shape per AGENTS.md §5.4:
 *   { success, code, message, requestId }
 *   (validation errors also include `details`)
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success:   false,
      code:      err.code,
      message:   err.message,
      requestId,
    };
    // Attach per-field details when the validate middleware added them
    const details = (err as AppError & { details?: unknown[] }).details;
    if (details) body['details'] = details;

    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected error – log full detail, return generic message to caller.
  logger.error({ err, requestId }, 'Unexpected error');
  res.status(500).json({
    success:   false,
    code:      'INTERNAL_ERROR',
    message:   'An unexpected error occurred',
    requestId,
  });
}