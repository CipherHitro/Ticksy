import type { JwtUserPayload } from './auth.types.js';
import type { RouteDefinition } from '../config/routes.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: JwtUserPayload;
      matchedRoute?: RouteDefinition;
      rawBody?: Buffer;
    }
  }
}

export {};
