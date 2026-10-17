import { request as undiciRequest } from 'undici';
import type { Request, Response, NextFunction } from 'express';
import { resolveUpstream } from '../discovery/resolver.js';
import { getBreaker } from './breaker.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

function isConnectionError(err: any): boolean {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    err.name === 'ConnectTimeoutError'
  );
}

export async function forwardRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const route = req.matchedRoute;
  if (!route) {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `No gateway route found matching ${req.method} ${req.originalUrl}`,
      requestId: req.requestId || 'unknown',
    });
    return;
  }

  const upstreamBase = resolveUpstream(route.upstream);
  const targetUrl = new URL(req.originalUrl, upstreamBase).toString();

  // 1. Prepare forwarded headers
  const forwardedHeaders: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lowerKey = key.toLowerCase();

    // Strip client-supplied X-User-* and X-Forwarded-* headers (security)
    if (lowerKey.startsWith('x-user-') || lowerKey.startsWith('x-forwarded-')) {
      continue;
    }

    // Do not pass original Host header so upstream matches its own host
    if (lowerKey === 'host') {
      continue;
    }

    forwardedHeaders[key] = value;
  }

  // Canonical forwarding headers
  forwardedHeaders['x-request-id'] = req.requestId || 'unknown';
  forwardedHeaders['x-forwarded-for'] = req.ip || req.socket.remoteAddress || '127.0.0.1';
  forwardedHeaders['x-forwarded-proto'] = req.protocol || 'http';

  // Body handling: forward raw buffer directly without re-serializing
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.rawBody && req.rawBody.length > 0;
  const requestBody = hasBody ? req.rawBody : undefined;

  const breaker = getBreaker(route.upstream);

  const executeCall = async () => {
    const makeRequest = async () => {
      return await undiciRequest(targetUrl, {
        method: req.method as any,
        headers: forwardedHeaders,
        body: requestBody,
        signal: AbortSignal.timeout(env.UPSTREAM_TIMEOUT_MS),
      });
    };

    let upstreamRes;
    try {
      upstreamRes = await makeRequest();
    } catch (err: any) {
      // Retry once on connection error for idempotent GET/HEAD only
      if ((req.method === 'GET' || req.method === 'HEAD') && isConnectionError(err)) {
        logger.warn(
          { upstream: route.upstream, url: targetUrl, error: err.message },
          'Connection error on GET/HEAD, retrying once...'
        );
        upstreamRes = await makeRequest();
      } else {
        throw err;
      }
    }

    // Treat 5xx as breaker failures while still capturing response body for client
    if (upstreamRes.statusCode >= 500) {
      const chunks: Buffer[] = [];
      for await (const chunk of upstreamRes.body) {
        chunks.push(chunk as Buffer);
      }
      const bodyBuffer = Buffer.concat(chunks);

      const upstreamError: any = new Error(`Upstream ${route.upstream} responded with status ${upstreamRes.statusCode}`);
      upstreamError.statusCode = upstreamRes.statusCode;
      upstreamError.headers = upstreamRes.headers;
      upstreamError.bodyBuffer = bodyBuffer;
      throw upstreamError;
    }

    return upstreamRes;
  };

  try {
    const upstreamRes = (await breaker.fire(executeCall)) as Awaited<ReturnType<typeof undiciRequest>>;

    // Copy status code
    res.status(upstreamRes.statusCode);

    // Copy upstream headers
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined || value === null) continue;
      const lowerKey = key.toLowerCase();

      // Skip hop-by-hop headers
      if (lowerKey === 'transfer-encoding' || lowerKey === 'connection' || lowerKey === 'keep-alive') {
        continue;
      }

      // Preserve Set-Cookie header (essential for refresh tokens)
      if (lowerKey === 'set-cookie') {
        res.setHeader('Set-Cookie', value as string | string[]);
        continue;
      }

      res.setHeader(key, value as string | string[]);
    }

    // Stream upstream body directly to client
    for await (const chunk of upstreamRes.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err: any) {
    // If the error was a 5xx returned from upstream, stream that 5xx response to the client
    if (err && err.bodyBuffer) {
      res.status(err.statusCode);
      if (err.headers) {
        for (const [key, value] of Object.entries(err.headers)) {
          if (value === undefined) continue;
          const lower = key.toLowerCase();
          if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'keep-alive') continue;
          if (lower === 'set-cookie') {
            res.setHeader('Set-Cookie', value as string | string[]);
            continue;
          }
          res.setHeader(key, value as string | string[]);
        }
      }
      res.send(err.bodyBuffer);
      return;
    }

    // Pass network errors / circuit breaker trip errors to error handler
    next(err);
  }
}
