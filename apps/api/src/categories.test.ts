import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loggedInInject, multipartBody } from './test/helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

const CARTAO = [
  'date,title,amount',
  '2026-08-03,Seguradora X*10 de,"150,00"',
  '2026-09-03,Seguradora X*11 de,"150,00"',
  '2026-08-05,Posto Ipiranga,"200,00"',
  '2026-08-06,Netflix.Com,"39,90"',
].join('\n');

describe('categorias do usuário', () => {
  let ctx: Ctx;
  let inject: Awaited<ReturnType<typeof loggedInInject>>;
  const txId = async (q: string) =>
    (await inject({ method: 'GET', url: `/api/transactions?q=${encodeURIComponent(q)}` })).json()[0]
      .id as number;
  const categoryOf = async (q: string) =>
    (await inject({ method: 'GET', url: `/api/transactions?q=${encodeURIComponent(q)}` }))
      .json()
      .map((t: { category: string }) => t.category);

  beforeAll(async () => {
    ctx = await createTestApp();
    inject = await loggedInInject(ctx.app);
    await inject({
      method: 'POST',
      url: '/api/import/csv',
      ...multipartBody([{ name: 'f.csv', content: CARTAO }]),
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('lista as padrão', async () => {
    const cats = (await inject({ method: 'GET', url: '/api/categories' })).json();
    expect(cats.find((c: { name: string }) => c.name === 'Moradia')).toEqual({
      name: 'Moradia',
      type: 'fixo',
      builtin: true,
    });
  });

  it('cria categoria e recusa nome repetido (sem diferenciar maiúsculas/acentos)', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'Moto', type: 'variavel' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Moto', type: 'variavel' });

    const dup = await inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'moto', type: 'fixo' },
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toMatch(/Já existe a categoria "Moto"/);

    const builtin = await inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'salario', type: 'entrada' },
    });
    expect(builtin.json().error).toMatch(/Já existe a categoria "Salário"/);

    const badType = await inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'X1', type: 'ignorar' },
    });
    expect(badType.statusCode).toBe(400);
  });

  it('usa a categoria nova em lançamento e no resumo', async () => {
    const id = await txId('Posto Ipiranga');
    const res = await inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { category: 'Moto' },
    });
    expect(res.statusCode).toBe(200);
    const { summary } = (await inject({ method: 'GET', url: '/api/summary?month=2026-08' })).json();
    expect(
      summary.variables.find((v: { category: string }) => v.category === 'Moto'),
    ).toMatchObject({ spentCents: 20000, budgetCents: 0, ratio: null, status: 'ok' });
  });

  it('recusa categoria que não existe', async () => {
    const id = await txId('Netflix');
    const res = await inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { category: 'Inexistente' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('"Aplicar a todos" sugere o texto sem a parcela e pega os outros meses', async () => {
    await inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'Seguro da moto', type: 'fixo' },
    });
    const id = await txId('Seguradora X');
    const res = await inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { category: 'Seguro da moto', applyToAll: true },
    });
    expect(res.json().rule).toEqual({ pattern: 'Seguradora X', category: 'Seguro da moto' });
    expect(await categoryOf('Seguradora X')).toEqual(['Seguro da moto', 'Seguro da moto']);
  });

  it('"Aplicar a todos" aceita texto escolhido, desde que esteja no nome', async () => {
    const id = await txId('Netflix');
    const bad = await inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { category: 'Lazer', applyToAll: true, pattern: 'Spotify' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/não aparece/);
  });

  it('meta para categoria do usuário', async () => {
    const res = await inject({ method: 'PUT', url: '/api/budgets', payload: { Moto: 30000 } });
    expect(res.json().Moto).toBe(30000);
  });

  it('renomear leva regras, manuais e meta junto', async () => {
    const cats = (await inject({ method: 'GET', url: '/api/categories' })).json();
    const moto = cats.find((c: { name: string }) => c.name === 'Moto');
    const res = await inject({
      method: 'PATCH',
      url: `/api/categories/${moto.id}`,
      payload: { name: 'Combustível' },
    });
    expect(res.json().name).toBe('Combustível');
    expect(await categoryOf('Posto Ipiranga')).toEqual(['Combustível']);
    expect((await inject({ method: 'GET', url: '/api/budgets' })).json().Combustível).toBe(30000);
  });

  it('apagar remove regras e meta e devolve os lançamentos às regras', async () => {
    const cats = (await inject({ method: 'GET', url: '/api/categories' })).json();
    const seguro = cats.find((c: { name: string }) => c.name === 'Seguro da moto');
    const res = await inject({ method: 'DELETE', url: `/api/categories/${seguro.id}` });
    expect(res.statusCode).toBe(200);
    expect(await categoryOf('Seguradora X')).toEqual(['Outros', 'Outros']);
    const rules = (await inject({ method: 'GET', url: '/api/rules' })).json();
    expect(rules.some((r: { category: string }) => r.category === 'Seguro da moto')).toBe(false);
  });

  it('categorias padrão não podem ser apagadas (não têm id)', async () => {
    const res = await inject({ method: 'DELETE', url: '/api/categories/9999' });
    expect(res.statusCode).toBe(404);
  });
});
