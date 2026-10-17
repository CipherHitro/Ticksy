import type { AccessTokenPayload } from './jwt.types.js';

declare global {
  namespace Express {
    interface Request {
      user?:      AccessTokenPayload;
      requestId?: string;
    }
  }
}

export {};
