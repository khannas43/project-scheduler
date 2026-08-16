import { buildApp } from './app.js';
import { env } from './env.js';

function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(typeof reason === 'string' ? reason : 'unknown_rejection');
}

async function main(): Promise<void> {
  const app = await buildApp();
  let shuttingDown = false;

  const shutdown = (signal: string, exitCode = 0): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting_down');
    app
      .close()
      .then(() => {
        process.exit(exitCode);
      })
      .catch((err: unknown) => {
        app.log.error({ err: asError(err) }, 'shutdown_failed');
        process.exit(1);
      });
  };

  // Last-resort handlers: log with stack server-side, then exit so the process
  // does not continue in an undefined state. Orchestrators restart the container.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: asError(reason) }, 'unhandled_rejection');
  });

  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'uncaught_exception');
    shutdown('uncaughtException', 1);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.fatal({ err: asError(err) }, 'listen_failed');
    process.exitCode = 1;
  }
}

void main();
