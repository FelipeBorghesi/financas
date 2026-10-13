import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestDb, testConfig } from './test/helpers.js';

describe('arquivos do front', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
  let app: Awaited<ReturnType<typeof buildApp>>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
    const t = await createTestDb();
    close = t.close;
    app = await buildApp({ db: t.db, config: testConfig(), webDist: dir });
  });
  afterAll(async () => {
    await app.close();
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serve o index e os assets', async () => {
    expect((await app.inject('/')).headers['content-type']).toMatch(/html/);
    expect((await app.inject('/assets/app.js')).headers['content-type']).toMatch(/javascript/);
  });

  it('rotas da SPA caem no index.html', async () => {
    const res = await app.inject('/metas');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>app</title>');
  });

  it('arquivo inexistente é 404, não o index.html', async () => {
    const res = await app.inject('/assets/nao-existe.js');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).not.toMatch(/html/);
  });

  it('rota de API inexistente é 404 JSON (com sessão exigida antes)', async () => {
    expect((await app.inject('/api/nada')).statusCode).toBe(401);
  });
});
