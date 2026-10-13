import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { setupAuth } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { HttpError } from './lib/errors.js';
import { dataRoutes } from './routes/data.js';
import { importRoutes } from './routes/import.js';

export interface AppDeps {
  db: Db;
  config: Config;
  /** Pasta com o build do front (apps/web/dist). Se não existir, a API não serve estáticos. */
  webDist?: string;
  logger?: FastifyServerOptions['logger'];
}

export const DEFAULT_WEB_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/dist',
);

export async function buildApp(deps: AppDeps) {
  const { db, config } = deps;
  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 20 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'Dados inválidos: ' + err.issues.map((i) => i.message).join('; '),
      });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (err as Error).message });
    }
    req.log.error({ err: { name: (err as Error).name, message: (err as Error).message } }, 'erro');
    return reply
      .status(500)
      .send({ error: 'Erro inesperado no servidor. Tente de novo; se continuar, veja os logs.' });
  });

  await setupAuth(app, { config });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(dataRoutes, { db });
  await app.register(importRoutes, { db });

  app.all('/api/*', async (_req, reply) =>
    reply.status(404).send({ error: 'Rota não encontrada.' }),
  );

  const webDist = deps.webDist ?? DEFAULT_WEB_DIST;
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      // Só rotas da SPA (sem extensão) caem no index.html; arquivo inexistente é 404.
      if (req.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path)) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Rota não encontrada.' });
    });
  }

  return app;
}
