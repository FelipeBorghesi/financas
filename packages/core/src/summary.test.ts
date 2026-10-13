import { describe, expect, it } from 'vitest';
import { mergeCategories, type Category } from './categories.js';
import type { AccountKind } from './merchant.js';
import {
  budgetStatus,
  buildEvolution,
  listMonths,
  summarizeMonth,
  type SummaryTransaction,
} from './summary.js';

const tx = (
  date: string,
  amountCents: number,
  category: Category,
  merchantKey = 'X',
  accountKind: AccountKind = 'conta',
): SummaryTransaction => ({ date, amountCents, category, merchantKey, accountKind });

const NOW = new Date('2026-10-13T12:00:00Z');

const txs: SummaryTransaction[] = [
  tx('2026-08-05', 600000, 'Salário'),
  tx('2026-08-06', 1000, 'Outras entradas'),
  tx('2026-08-10', -155000, 'Moradia', 'CONSTRUTORA EXEMPLO'),
  tx('2026-08-11', -3990, 'Assinaturas', 'Netflix', 'cartao'),
  tx('2026-08-12', -2190, 'Assinaturas', 'Spotify', 'cartao'),
  tx('2026-08-13', -2190, 'Assinaturas', 'spotify', 'cartao'),
  tx('2026-08-14', -35000, 'Alimentação fora', 'Ifd*', 'cartao'),
  tx('2026-08-15', -32000, 'Mercado e padaria', 'MERCADO', 'cartao'),
  tx('2026-08-16', -20000, 'Lazer', 'Cinema', 'cartao'),
  tx('2026-08-16', 2000, 'Compras', 'Amazon', 'cartao'), // estorno reduz o gasto
  tx('2026-08-17', -50000, 'Investimento', 'Aplicação RDB'),
  tx('2026-08-18', 10000, 'Investimento', 'Resgate RDB'),
  tx('2026-08-20', -150000, 'Pagamento de fatura', 'Pagamento de fatura'),
  tx('2026-08-20', 150000, 'Pagamento de fatura', 'Pagamento recebido', 'cartao'),
  tx('2026-09-05', 600000, 'Salário'),
  tx('2026-10-01', -1000, 'Outros', 'Y', 'cartao'),
];

describe('summarizeMonth', () => {
  const s = summarizeMonth('2026-08', txs, undefined, NOW);

  it('entradas, gastos, investido e sobra', () => {
    expect(s.entradasCents).toBe(601000);
    expect(s.fixosCents).toBe(155000 + 3990 + 2190 + 2190);
    expect(s.variaveisCents).toBe(35000 + 32000 + 20000 - 2000);
    expect(s.gastosCents).toBe(s.fixosCents + s.variaveisCents);
    expect(s.investidoCents).toBe(40000);
    expect(s.investmentGoalCents).toBe(50000);
    expect(s.sobraCents).toBe(s.entradasCents - s.gastosCents);
  });

  it('pagamento de fatura não entra em nada', () => {
    expect(s.byCategory['Pagamento de fatura']).toBe(0);
    const semFatura = summarizeMonth(
      '2026-08',
      txs.filter((t) => t.category !== 'Pagamento de fatura'),
      undefined,
      NOW,
    );
    expect(semFatura.gastosCents).toBe(s.gastosCents);
    expect(semFatura.entradasCents).toBe(s.entradasCents);
  });

  it('agrupa fixos por estabelecimento (sem diferenciar maiúsculas)', () => {
    expect(s.fixed).toEqual([
      { category: 'Moradia', merchantKey: 'CONSTRUTORA EXEMPLO', totalCents: 155000, count: 1 },
      { category: 'Assinaturas', merchantKey: 'Spotify', totalCents: 4380, count: 2 },
      { category: 'Assinaturas', merchantKey: 'Netflix', totalCents: 3990, count: 1 },
    ]);
  });

  it('variáveis x meta com status', () => {
    const by = Object.fromEntries(s.variables.map((v) => [v.category, v]));
    expect(by['Alimentação fora']).toMatchObject({
      spentCents: 35000,
      budgetCents: 40000,
      status: 'atencao',
    });
    expect(by['Mercado e padaria']).toMatchObject({ spentCents: 32000, status: 'estourou' });
    expect(by['Lazer']).toMatchObject({ spentCents: 20000, status: 'estourou' });
    expect(by['Compras']).toMatchObject({ spentCents: -2000, status: 'ok' });
    expect(by['Outros']).toMatchObject({ spentCents: 0, status: 'ok' });
  });

  it('usa metas informadas', () => {
    const s2 = summarizeMonth('2026-08', txs, { Lazer: 30000, Investimento: 40000 }, NOW);
    expect(s2.variables.find((v) => v.category === 'Lazer')?.status).toBe('ok');
    expect(s2.investmentGoalCents).toBe(40000);
  });

  it('mês completo, fechado', () => {
    expect(s.hasConta && s.hasCartao).toBe(true);
    expect(s.incomplete).toBe(false);
    expect(s.partial).toBe(false);
  });

  it('avisa mês incompleto (só conta ou só cartão)', () => {
    expect(summarizeMonth('2026-09', txs, undefined, NOW)).toMatchObject({
      hasConta: true,
      hasCartao: false,
      incomplete: true,
    });
    expect(summarizeMonth('2026-10', txs, undefined, NOW)).toMatchObject({
      hasConta: false,
      hasCartao: true,
      incomplete: true,
      partial: true,
    });
  });

  it('mês vazio não é incompleto', () => {
    expect(summarizeMonth('2026-01', txs, undefined, NOW).incomplete).toBe(false);
  });
});

describe('budgetStatus', () => {
  it('verde até 85%, amarelo acima de 85%, vermelho acima de 100%', () => {
    expect(budgetStatus(85, 100)).toBe('ok');
    expect(budgetStatus(86, 100)).toBe('atencao');
    expect(budgetStatus(100, 100)).toBe('atencao');
    expect(budgetStatus(101, 100)).toBe('estourou');
    expect(budgetStatus(1, 0)).toBe('ok'); // sem meta: sem alerta
    expect(budgetStatus(0, 0)).toBe('ok');
  });
});

describe('evolução e meses', () => {
  it('lista os meses em ordem', () => {
    expect(listMonths(txs)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
  it('entradas x gastos por mês', () => {
    expect(buildEvolution(txs)).toEqual([
      { month: '2026-08', entradasCents: 601000, gastosCents: 248370 },
      { month: '2026-09', entradasCents: 600000, gastosCents: 0 },
      { month: '2026-10', entradasCents: 0, gastosCents: 1000 },
    ]);
  });
});

describe('categorias do usuário', () => {
  const categories = mergeCategories([
    { name: 'Moto', type: 'variavel' },
    { name: 'Seguro da moto', type: 'fixo' },
    { name: 'Freela', type: 'entrada' },
  ]);
  const custom: SummaryTransaction[] = [
    tx('2026-08-01', 300000, 'Freela'),
    tx('2026-08-02', -25000, 'Moto', 'Posto Ipiranga', 'cartao'),
    tx('2026-08-03', -15000, 'Seguro da moto', 'Seguradora X*10 de', 'cartao'),
  ];

  it('entram nos totais conforme o tipo', () => {
    const s = summarizeMonth('2026-08', custom, { Moto: 20000 }, NOW, categories);
    expect(s.entradasCents).toBe(300000);
    expect(s.variaveisCents).toBe(25000);
    expect(s.fixosCents).toBe(15000);
    expect(s.fixed).toEqual([
      {
        category: 'Seguro da moto',
        merchantKey: 'Seguradora X*10 de',
        totalCents: 15000,
        count: 1,
      },
    ]);
    expect(s.variables.find((v) => v.category === 'Moto')).toMatchObject({
      spentCents: 25000,
      budgetCents: 20000,
      status: 'estourou',
    });
  });

  it('categoria sem meta não fica vermelha', () => {
    const s = summarizeMonth('2026-08', custom, {}, NOW, categories);
    expect(s.variables.find((v) => v.category === 'Moto')).toMatchObject({
      ratio: null,
      status: 'ok',
    });
  });

  it('evolução usa os tipos das categorias do usuário', () => {
    expect(buildEvolution(custom, categories)).toEqual([
      { month: '2026-08', entradasCents: 300000, gastosCents: 40000 },
    ]);
  });
});
