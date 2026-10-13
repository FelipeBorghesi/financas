import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loggedInInject, multipartBody } from './test/helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

export const CONTA_CSV = [
  'Data,Valor,Identificador,Descrição',
  '05/08/2026,6000.00,00000000-0000-4000-8000-000000000001,Transferência recebida pelo Pix - FULANO DE TAL - •••.111.222-•• - BANCO EXEMPLO',
  '10/08/2026,-1550.00,00000000-0000-4000-8000-000000000002,Transferência enviada pelo Pix - CONSTRUTORA EXEMPLO SPE - 12.345',
  '11/08/2026,-20.00,00000000-0000-4000-8000-000000000003,Transferência enviada pelo Pix - CICLANO - •••.123.456-•• - MERCADO PAGO IP LTDA.',
  '15/08/2026,-1000.00,00000000-0000-4000-8000-000000000004,Pagamento de fatura',
  '16/08/2026,-500.00,00000000-0000-4000-8000-000000000005,Aplicação RDB',
].join('\n');

export const CARTAO_CSV = [
  'date,title,amount',
  '2026-08-12,Netflix.Com,"39,90"',
  '2026-08-13,Ifd*Restaurante Bom,"45,00"',
  '2026-08-13,Ifd*Restaurante Bom,"45,00"',
  '2026-08-14,Loja Qualquer,"100,00"',
  '2026-08-15,Pagamento recebido,"- 1.000,00"',
].join('\n');

describe('API de dados', () => {
  let ctx: Ctx;
  let inject: Awaited<ReturnType<typeof loggedInInject>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    inject = await loggedInInject(ctx.app);
    // regras pessoais (no app real vêm de regras-pessoais.json via npm run import-rules)
    for (const payload of [
      { pattern: 'recebida pelo Pix - FULANO DE TAL', category: 'Salário', field: 'desc' },
      { pattern: 'CONSTRUTORA EXEMPLO', category: 'Moradia' },
    ]) {
      const res = await inject({ method: 'POST', url: '/api/rules', payload });
      if (res.statusCode !== 200) throw new Error(res.body);
    }
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('healthcheck', async () => {
    const res = await inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('importa CSV da conta e do cartão, e deduplica no reimport', async () => {
    const body = multipartBody([
      { name: 'extrato.csv', content: CONTA_CSV },
      { name: 'fatura.csv', content: CARTAO_CSV },
      { name: 'outro.csv', content: 'a,b\n1,2' },
    ]);
    const res = await inject({ method: 'POST', url: '/api/import/csv', ...body });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results[0]).toMatchObject({ kind: 'conta', inserted: 5, duplicates: 0 });
    expect(results[1]).toMatchObject({ kind: 'cartao', inserted: 5, duplicates: 0 });
    expect(results[2].error).toMatch(/Formato de CSV não reconhecido/);

    const again = await inject({
      method: 'POST',
      url: '/api/import/csv',
      ...multipartBody([{ name: 'fatura.csv', content: CARTAO_CSV }]),
    });
    expect(again.json().results[0]).toMatchObject({ inserted: 0, duplicates: 5 });
  });

  it('lista meses', async () => {
    const res = await inject({ method: 'GET', url: '/api/months' });
    expect(res.json().months).toEqual(['2026-08']);
  });

  it('resumo do mês', async () => {
    const res = await inject({ method: 'GET', url: '/api/summary?month=2026-08' });
    expect(res.statusCode).toBe(200);
    const { summary, evolution } = res.json();
    expect(summary.entradasCents).toBe(600000);
    expect(summary.fixosCents).toBe(155000 + 3990);
    expect(summary.variaveisCents).toBe(2000 + 9000 + 10000);
    expect(summary.investidoCents).toBe(50000);
    expect(summary.sobraCents).toBe(600000 - 155000 - 3990 - 21000);
    expect(summary.incomplete).toBe(false);
    expect(evolution).toHaveLength(1);
  });

  it('valida o mês', async () => {
    const res = await inject({ method: 'GET', url: '/api/summary?month=2026-13' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/aaaa-mm/);
  });

  it('lista lançamentos com categoria, filtro e busca', async () => {
    const all = (await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })).json();
    expect(all).toHaveLength(10);
    const pix = all.find((t: { merchantKey: string }) => t.merchantKey === 'CICLANO');
    expect(pix.category).toBe('Pix p/ pessoas');

    const filtered = (
      await inject({
        method: 'GET',
        url: '/api/transactions?category=' + encodeURIComponent('Alimentação fora'),
      })
    ).json();
    expect(filtered).toHaveLength(2);

    const searched = (await inject({ method: 'GET', url: '/api/transactions?q=netflix' })).json();
    expect(searched).toHaveLength(1);
  });

  it('troca categoria manualmente', async () => {
    const url = '/api/transactions?q=' + encodeURIComponent('Loja Qualquer');
    const all = (await inject({ method: 'GET', url })).json();
    expect(all[0].category).toBe('Outros');
    const res = await inject({
      method: 'PATCH',
      url: `/api/transactions/${all[0].id}`,
      payload: { category: 'Compras' },
    });
    expect(res.statusCode).toBe(200);
    const after = (await inject({ method: 'GET', url })).json();
    expect(after[0]).toMatchObject({ category: 'Compras', categorySource: 'manual' });
  });

  it('"Aplicar a todos" cria regra e reclassifica o histórico', async () => {
    const url = '/api/transactions?q=' + encodeURIComponent('Restaurante Bom');
    const all = (await inject({ method: 'GET', url })).json();
    const res = await inject({
      method: 'PATCH',
      url: `/api/transactions/${all[0].id}`,
      payload: { category: 'Lazer', applyToAll: true },
    });
    expect(res.json().rule).toEqual({ pattern: 'Ifd*Restaurante Bom', category: 'Lazer' });
    const after = (await inject({ method: 'GET', url })).json();
    expect(after.map((t: { category: string }) => t.category)).toEqual(['Lazer', 'Lazer']);

    type R = { id: number; pattern: string; category: string };
    const restaurante = async () =>
      ((await inject({ method: 'GET', url: '/api/rules' })).json() as R[]).filter(
        (r) => r.pattern === 'Ifd*Restaurante Bom',
      );
    expect(await restaurante()).toHaveLength(1);

    // aplicar de novo com outra categoria atualiza a mesma regra
    await inject({
      method: 'PATCH',
      url: `/api/transactions/${all[1].id}`,
      payload: { category: 'Alimentação fora', applyToAll: true },
    });
    const rules2 = await restaurante();
    expect(rules2).toEqual([expect.objectContaining({ category: 'Alimentação fora' })]);

    const del = await inject({ method: 'DELETE', url: `/api/rules/${rules2[0]!.id}` });
    expect(del.statusCode).toBe(200);
    expect(await restaurante()).toEqual([]);
  });

  it('rejeita categoria inválida', async () => {
    const res = await inject({
      method: 'PATCH',
      url: '/api/transactions/1',
      payload: { category: 'Bobagem' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('metas: padrão e edição', async () => {
    const b = (await inject({ method: 'GET', url: '/api/budgets' })).json();
    expect(b.Lazer).toBe(15000);
    expect(b.Investimento).toBe(50000);
    const res = await inject({ method: 'PUT', url: '/api/budgets', payload: { Lazer: 20000 } });
    expect(res.json().Lazer).toBe(20000);
    const bad = await inject({ method: 'PUT', url: '/api/budgets', payload: { Salário: 1 } });
    expect(bad.statusCode).toBe(400);
  });
});
