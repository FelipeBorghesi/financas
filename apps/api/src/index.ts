import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';

async function main() {
  const config = loadConfig();
  const { db, migrate, close } = await createDb(config.DATABASE_URL);
  await migrate();

  const app = await buildApp({
    db,
    config,
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Nunca logar corpo de requisição, cookies ou tokens.
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
  });

  const shutdown = async () => {
    await app.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause) console.error('Causa:', cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
