import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.js';

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;

/** Rotas da API que não exigem sessão. */
const PUBLIC_ROUTES = new Set(['/api/health', '/api/auth/login']);

interface Session {
  email: string;
  exp: number;
  /** muda quando a senha muda, invalidando sessões antigas */
  pv: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
}

function passwordVersion(config: Config) {
  return createHash('sha256').update(config.APP_PASSWORD_HASH).digest('base64url').slice(0, 12);
}

function readSession(req: FastifyRequest, config: Config): Session | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const s = JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8')) as Session;
    if (typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    if (s.pv !== passwordVersion(config)) return null;
    if (s.email.toLowerCase() !== config.APP_USER_EMAIL.toLowerCase()) return null;
    return s;
  } catch {
    return null;
  }
}

function setSession(reply: FastifyReply, config: Config) {
  const session: Session = {
    email: config.APP_USER_EMAIL,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    pv: passwordVersion(config),
  };
  reply.setCookie(SESSION_COOKIE, Buffer.from(JSON.stringify(session)).toString('base64url'), {
    signed: true,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

const sameOrigin = (req: FastifyRequest) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.host;
  } catch {
    return false;
  }
};

/** Chamado direto no app raiz (não via register) para o hook valer em todas as rotas. */
export async function setupAuth(app: FastifyInstance, opts: { config: Config }) {
  const { config } = opts;
  // Hash fixo para comparar mesmo quando o e-mail está errado (tempo de resposta igual).
  const dummyHash = await bcrypt.hash('senha-que-nunca-confere', 10);

  app.decorateRequest('session', null);

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return;

    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutating) {
      if (req.headers['x-csrf'] !== '1' || !sameOrigin(req)) {
        return reply
          .status(403)
          .send({ error: 'Requisição recusada (CSRF). Recarregue a página e tente de novo.' });
      }
    }

    req.session = readSession(req, config);
    if (!req.session && !PUBLIC_ROUTES.has(path)) {
      return reply.status(401).send({ error: 'Sessão expirada. Faça login para continuar.' });
    }
  });

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          errorResponseBuilder: () => {
            const message = 'Muitas tentativas de login. Espere um minuto e tente de novo.';
            return { statusCode: 429, error: message, message };
          },
        },
      },
    },
    async (req, reply) => {
      const body = z
        .object({ email: z.string().max(200), password: z.string().max(200) })
        .parse(req.body);
      const emailOk = body.email.trim().toLowerCase() === config.APP_USER_EMAIL.toLowerCase();
      const passOk = await bcrypt.compare(
        body.password,
        emailOk ? config.APP_PASSWORD_HASH : dummyHash,
      );
      if (!emailOk || !passOk) {
        return reply.status(401).send({ error: 'E-mail ou senha incorretos.' });
      }
      setSession(reply, config);
      return { email: config.APP_USER_EMAIL };
    },
  );

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ email: req.session?.email }));
}
