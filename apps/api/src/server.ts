import { buildApp } from './app.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exitCode = 1;
    return;
  }

  const shutdown = (signal: string): void => {
    app.log.info(`Received ${signal}, shutting down`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error(err);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
