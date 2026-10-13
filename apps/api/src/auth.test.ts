import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import {
  createTestApp,
  createTestDb,
  TEST_EMAIL,
  TEST_PASSWORD,
  testConfig,
} from './test/helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

const login = (
  ctx: Ctx,
  email: string,
  password: string,
  headers: Record<string, string> = { 'x-csrf': '1' },
) =>
  ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email, password } });

describe('autenticação', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('healthcheck é público', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('todas as outras rotas exigem sessão', async () => {
    for (const url of [
      '/api/months',
      '/api/summary?month=2026-08',
      '/api/transactions',
      '/api/rules',
      '/api/budgets',
      '/api/auth/me',
      '/api/sync/status',
    ]) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/budgets',
      headers: { 'x-csrf': '1' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('senha errada → 401 com mensagem', async () => {
    const res = await login(ctx, TEST_EMAIL, 'errada');
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('E-mail ou senha incorretos.');
    expect((await login(ctx, 'outro@example.com', TEST_PASSWORD)).statusCode).toBe(401);
  });

  it('login sem header CSRF ou de outra origem → 403', async () => {
    expect((await login(ctx, TEST_EMAIL, TEST_PASSWORD, {})).statusCode).toBe(403);
    const cross = await login(ctx, TEST_EMAIL, TEST_PASSWORD, {
      'x-csrf': '1',
      origin: 'https://malicioso.example',
    });
    expect(cross.statusCode).toBe(403);
  });

  it('login certo → cookie httpOnly, secure, sameSite=lax; sessão funciona; logout', async () => {
    const res = await login(ctx, TEST_EMAIL.toUpperCase(), TEST_PASSWORD);
    expect(res.statusCode).toBe(200);
    const c = res.cookies.find((x) => x.name === 'sid');
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const cookie = `sid=${c!.value}`;

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json()).toEqual({ email: TEST_EMAIL });

    // cookie adulterado
    const forged = Buffer.from(
      JSON.stringify({ email: TEST_EMAIL, exp: Date.now() + 1e9, pv: 'x' }),
    ).toString('base64url');
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `sid=${forged}.assinaturafalsa` },
    });
    expect(bad.statusCode).toBe(401);

    // mutação com sessão mas sem CSRF
    const noCsrf = await ctx.app.inject({
      method: 'PUT',
      url: '/api/budgets',
      headers: { cookie },
      payload: { Lazer: 1 },
    });
    expect(noCsrf.statusCode).toBe(403);

    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'x-csrf': '1' },
    });
    expect(out.statusCode).toBe(200);
    expect(out.cookies.find((x) => x.name === 'sid')?.value).toBe('');
  });

  it('rate limit no login', async () => {
    const results: number[] = [];
    for (let i = 0; i < 7; i++) results.push((await login(ctx, TEST_EMAIL, 'errada')).statusCode);
    expect(results).toContain(429);
    const res = await login(ctx, TEST_EMAIL, 'errada');
    expect(res.json().error).toMatch(/Muitas tentativas/);
  });
});

describe('troca de senha invalida sessões antigas', () => {
  it('sessão emitida com outra senha é recusada', async () => {
    const { db, close } = await createTestDb();
    const app1 = await buildApp({ db, config: testConfig(), webDist: '/x' });
    const res = await app1.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-csrf': '1' },
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = `sid=${res.cookies.find((x) => x.name === 'sid')!.value}`;
    const app2 = await buildApp({
      db,
      config: testConfig({ APP_PASSWORD_HASH: bcrypt.hashSync('nova-senha-123', 4) }),
      webDist: '/x',
    });
    expect(
      (await app1.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (await app2.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(401);
    await app1.close();
    await app2.close();
    await close();
  });
});
