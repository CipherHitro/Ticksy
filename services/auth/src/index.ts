import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';

async function main() {
  await prisma.$connect();
  console.log('Database connected');

  const server = app.listen(env.PORT, () => {
    console.log(`auth-service listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  async function shutdown(signal: string) {
    console.log(`${signal} received: closing server gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start auth-service:', err);
  process.exit(1);
});