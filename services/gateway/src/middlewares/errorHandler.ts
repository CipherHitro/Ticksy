import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || 'unknown';

  // 1. Circuit breaker open (503 UPSTREAM_UNAVAILABLE)
  if (err && (err.code === 'EOPENBREAKER' || err.message === 'Breaker is open')) {
    logger.warn({ err, requestId, path: req.originalUrl }, 'Circuit breaker open');
    res.setHeader('Retry-After', '10');
    res.status(503).json({
      success: false,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Upstream service is temporarily unavailable due to high failure rate. Please try again later.',
      requestId,
    });
    return;
  }

  // 2. Request timeout (504 UPSTREAM_TIMEOUT)
  if (
    err &&
    (err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      err.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      err.code === 'ETIMEDOUT')
  ) {
    logger.error({ err, requestId, path: req.originalUrl }, 'Upstream request timed out');
    res.status(504).json({
      success: false,
      code: 'UPSTREAM_TIMEOUT',
      message: 'Upstream service timed out waiting for response',
      requestId,
    });
    return;
  }

  // 3. Upstream connection refused or unreachable (502 BAD_GATEWAY)
  const isConnectionRefused =
    err &&
    (err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'UND_ERR_SOCKET' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'EAI_AGAIN' ||
      err.name === 'ConnectTimeoutError');

  if (isConnectionRefused) {
    logger.error({ err, requestId, path: req.originalUrl }, 'Upstream service unreachable');
    res.status(502).json({
      success: false,
      code: 'BAD_GATEWAY',
      message: 'Bad gateway: upstream service is unreachable',
      requestId,
    });
    return;
  }

  // 4. Fallthrough: generic 500 INTERNAL_ERROR
  logger.error({ err, requestId, path: req.originalUrl }, 'Unhandled gateway error');
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred in API Gateway',
    requestId,
  });
}
