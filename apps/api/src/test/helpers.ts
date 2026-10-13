import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/pglite';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildApp } from '../app.js';
import type { Config } from '../config.js';
import { MIGRATIONS_FOLDER, type Db } from '../db/client.js';
import * as schema from '../db/schema.js';

export const TEST_EMAIL = 'eu@example.com';
export const TEST_PASSWORD = 'senha-de-teste-123';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: 'pglite://memory',
    SESSION_SECRET: 'x'.repeat(40),
    APP_USER_EMAIL: TEST_EMAIL,
    APP_PASSWORD_HASH: bcrypt.hashSync(TEST_PASSWORD, 4),
    ...overrides,
  };
}

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, close: () => client.close() };
}

export async function createTestApp(overrides: Partial<Config> = {}) {
  const { db, close } = await createTestDb();
  const config = testConfig(overrides);
  const app = await buildApp({ db, config, webDist: '/nao-existe' });
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

export function multipartBody(files: { name: string; content: string }[]) {
  const boundary = '----teste' + Math.random().toString(16).slice(2);
  const parts = files.map(
    (f) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: text/csv\r\n\r\n${f.content}\r\n`,
  );
  return {
    payload: Buffer.from(parts.join('') + `--${boundary}--\r\n`, 'utf8'),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** Faz login e devolve um `inject` que envia o cookie de sessão e o header CSRF. */
export async function loggedInInject(app: FastifyInstance) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-csrf': '1' },
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.body}`);
  const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return (opts: InjectOptions) =>
    app.inject({ ...opts, headers: { ...opts.headers, cookie, 'x-csrf': '1' } });
}
