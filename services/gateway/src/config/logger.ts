import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'gateway' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  customProps: (req: IncomingMessage, _res: ServerResponse) => ({
    requestId: (req as any).requestId,
  }),
});
