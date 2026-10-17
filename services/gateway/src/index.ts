import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Ticksy API Gateway listening');
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gateway gracefully...');
  server.close(() => {
    logger.info('Gateway HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forcefully terminating gateway after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
