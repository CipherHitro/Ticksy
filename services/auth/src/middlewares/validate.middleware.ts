import type { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field:   i.path.join('.') || 'body',
        message: i.message,
      }));
      const summary = details.map((d) => d.message).join(', ');
      // Pass details so callers can show per-field errors per AGENTS.md §5.4
      const err = new AppError(summary, 400, 'VALIDATION_ERROR') as AppError & { details?: unknown[] };
      (err as { details?: unknown[] }).details = details;
      return next(err);
    }
    req.body = result.data;
    next();
  };
}
