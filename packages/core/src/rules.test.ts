import { describe, expect, it } from 'vitest';
import type { Category } from './categories.js';
import { merchantKeyFor, suggestRulePattern, type AccountKind } from './merchant.js';
import { categorize, DEFAULT_RULES, type Rule } from './rules.js';

function cat(
  description: string,
  amountCents = -1000,
  kind: AccountKind = 'conta',
  userRules: Rule[] = [],
) {
  return categorize(
    { description, amountCents, merchantKey: merchantKeyFor(kind, description) },
    userRules,
  ).category;
}
const conta = (description: string, amountCents = -1000) => cat(description, amountCents, 'conta');
const cartao = (title: string, amountCents = -1000) => cat(title, amountCents, 'cartao');

describe('merchantKeyFor', () => {
  it('conta: trecho entre o primeiro " - " e o próximo', () => {
    expect(merchantKeyFor('conta', 'Compra no débito - PadariaBrasil')).toBe('PadariaBrasil');
    expect(
      merchantKeyFor(
        'conta',
        'Transferência enviada pelo Pix - FULANO DE TAL - •••.123.456-•• - MERCADO PAGO IP LTDA. (0323) Agência: 1 Conta: 2-3',
      ),
    ).toBe('FULANO DE TAL');
  });
  it('conta sem " - ": a descrição inteira', () => {
    expect(merchantKeyFor('conta', 'Aplicação RDB')).toBe('Aplicação RDB');
  });
  it('cartão: o título', () => {
    expect(merchantKeyFor('cartao', 'Ifd*Ifood Club')).toBe('Ifd*Ifood Club');
  });
});

describe('ordem de decisão', () => {
  it('manual vence tudo', () => {
    expect(
      categorize({
        description: 'Compra no débito - Netflix',
        merchantKey: 'Netflix',
        amountCents: -100,
        categoryManual: 'Lazer',
      }),
    ).toEqual({ category: 'Lazer', source: 'manual' });
  });
  it('regra do usuário vence regra padrão', () => {
    const rules: Rule[] = [{ pattern: 'netflix', category: 'Lazer' }];
    expect(cat('Compra no débito - Netflix', -100, 'conta', rules)).toBe('Lazer');
  });
  it('regra do usuário procura só na chave', () => {
    const rules: Rule[] = [{ pattern: 'débito', category: 'Lazer' }];
    expect(cat('Compra no débito - LojaX', -100, 'conta', rules)).toBe('Outros');
  });
  it('sem match: positivo → Outras entradas, negativo → Outros', () => {
    expect(conta('Compra no débito - LojaQualquer', -500)).toBe('Outros');
    expect(conta('Transferência recebida pelo Pix - FULANO - •••', 500)).toBe('Outras entradas');
  });
  it('case-insensitive', () => {
    expect(cartao('NETFLIX.COM')).toBe('Assinaturas');
    expect(cartao('netflix.com')).toBe('Assinaturas');
  });
});

describe('regras padrão', () => {
  const cases: [string, AccountKind, number, Category][] = [
    // Pagamentos, investimentos e entradas
    ['Pagamento de fatura', 'conta', -150000, 'Pagamento de fatura'],
    ['Pagamento recebido', 'cartao', 150000, 'Pagamento de fatura'],
    ['Aplicação RDB', 'conta', -50000, 'Investimento'],
    ['Resgate RDB', 'conta', 50000, 'Investimento'],
    ['Dinheiro guardado na Caixinha', 'conta', -10000, 'Investimento'],
    ['Crédito em conta', 'conta', 123, 'Outras entradas'],
    [
      'Pagamento de boleto efetuado - SECRETARIA DE ESTADO DA FAZENDA',
      'conta',
      -5000,
      'Impostos e taxas',
    ],
    ['Pagamento de boleto efetuado - DETRAN GO', 'conta', -5000, 'Impostos e taxas'],
    // Assinaturas e academia
    ['Amazonprime Brasil', 'cartao', -1990, 'Assinaturas'],
    ['Anthropic', 'cartao', -10000, 'Assinaturas'],
    ['Apple.Com/Bill', 'cartao', -990, 'Assinaturas'],
    ['Linkedin Premium', 'cartao', -5000, 'Assinaturas'],
    ['Ifd*Ifood Club', 'cartao', -990, 'Assinaturas'],
    ['Netflix.Com', 'cartao', -3990, 'Assinaturas'],
    ['Spotify', 'cartao', -2190, 'Assinaturas'],
    ['Disney Plus', 'cartao', -3390, 'Assinaturas'],
    ['Youtube Premium', 'cartao', -2490, 'Assinaturas'],
    ['Hbomax', 'cartao', -2990, 'Assinaturas'],
    // Gastos do dia a dia
    ['GOBOBARBESHOP', 'cartao', -5000, 'Cuidados pessoais'],
    ['Ifd*Restaurante Bom', 'cartao', -4000, 'Alimentação fora'],
    ['IFOOD *PEDIDO', 'cartao', -4000, 'Alimentação fora'],
    ['Cupim do Zé', 'cartao', -4000, 'Alimentação fora'],
    ['Espeto Bom', 'cartao', -4000, 'Alimentação fora'],
    ['Cantina Italiana', 'cartao', -4000, 'Alimentação fora'],
    ['PIZZARIA DO BAIRRO', 'cartao', -4000, 'Alimentação fora'],
    ['SORVETERIA GELADA', 'cartao', -1500, 'Alimentação fora'],
    ['BAR DO ZE', 'cartao', -4000, 'Alimentação fora'],
    ['Restaurante Sabor', 'cartao', -4000, 'Alimentação fora'],
    ['Compra no débito - DOCES - CONFEITARIA X', 'conta', -2000, 'Alimentação fora'],
    ['Compra no débito - PadariaBrasil', 'conta', -1500, 'Mercado e padaria'],
    ['MERCADO CENTRAL', 'cartao', -8000, 'Mercado e padaria'],
    ['INGRESSO.COM', 'cartao', -6000, 'Lazer'],
    ['Cinema Shopping', 'cartao', -6000, 'Lazer'],
    ['Tiktok Shop', 'cartao', -6000, 'Compras'],
    ['Mercadolivre*Loja', 'cartao', -6000, 'Compras'],
    ['Amazon Marketplace', 'cartao', -6000, 'Compras'],
    ['Shopee *Loja', 'cartao', -6000, 'Compras'],
    // Pix restantes
    ['Transferência enviada pelo Pix - CICLANO - •••', 'conta', -2000, 'Pix p/ pessoas'],
  ];

  it.each(cases)('%s → %s', (description, kind, amount, expected) => {
    expect(cat(description, amount, kind)).toBe(expected);
  });

  it('todas as regras padrão são cobertas por algum caso', () => {
    const uncovered = DEFAULT_RULES.filter(
      (rule) =>
        !cases.some(([d, kind, amount, expected]) => {
          const r = categorize({
            description: d,
            amountCents: amount,
            merchantKey: merchantKeyFor(kind, d),
          });
          return r.rule === rule && r.category === expected;
        }),
    ).map((r) => r.pattern);
    expect(uncovered).toEqual([]);
  });
});

describe('casos que já deram problema', () => {
  it('"MERCADO PAGO" num Pix pra pessoa vai para Pix p/ pessoas', () => {
    expect(
      conta(
        'Transferência enviada pelo Pix - BELTRANO SILVA - •••.123.456-•• - MERCADO PAGO IP LTDA. (0323) Agência: 1 Conta: 1234-5',
      ),
    ).toBe('Pix p/ pessoas');
  });
  it('"GOBOBARBESHOP" vai para Cuidados pessoais', () => {
    expect(cartao('GOBOBARBESHOP')).toBe('Cuidados pessoais');
  });
  it('"Ifd*Ifood Club" vai para Assinaturas', () => {
    expect(cartao('Ifd*Ifood Club')).toBe('Assinaturas');
  });
  it('"BARBEARIA" não cai em "BAR "', () => {
    expect(cartao('BARBEARIA DO ZE')).toBe('Cuidados pessoais');
  });
  it('"Amazonprime" vai para Assinaturas, não Compras', () => {
    expect(cartao('AmazonPrime BR')).toBe('Assinaturas');
  });
  it('"Mercadolivre" vai para Compras, não Mercado e padaria', () => {
    expect(cartao('MERCADOLIVRE*VENDEDOR')).toBe('Compras');
  });
  it('Pix recebido de pessoa não vira Pix p/ pessoas', () => {
    expect(conta('Transferência recebida pelo Pix - CICLANO - •••', 2000)).toBe('Outras entradas');
  });
  it('valor positivo não casa com "enviada pelo Pix"', () => {
    expect(conta('Estorno - Transferência enviada pelo Pix - CICLANO', 2000)).toBe(
      'Outras entradas',
    );
  });
  it('regra do usuário na descrição vence o Pix genérico (ex.: Pix pra própria conta)', () => {
    const rules: Rule[] = [
      { pattern: 'enviada pelo Pix - FULANO DE TAL', category: 'Moradia', field: 'desc' },
    ];
    expect(cat('Transferência enviada pelo Pix - FULANO DE TAL - •••', -1000, 'conta', rules)).toBe(
      'Moradia',
    );
  });
  it('regra do usuário só para saídas', () => {
    const rules: Rule[] = [
      { pattern: 'CICLANO', category: 'Academia', field: 'desc', onlyNegative: true },
    ];
    expect(cat('Transferência enviada pelo Pix - CICLANO - •••', -1000, 'conta', rules)).toBe(
      'Academia',
    );
    expect(cat('Transferência recebida pelo Pix - CICLANO - •••', 1000, 'conta', rules)).toBe(
      'Outras entradas',
    );
  });
});

describe('suggestRulePattern', () => {
  it.each([
    ['Seguradora X*10 de', 'Seguradora X'],
    ['Seguradora X*11 de 12', 'Seguradora X'],
    ['Loja X 3/10', 'Loja X'],
    ['Loja X - Parcela 3/10', 'Loja X'],
    ['Netflix.Com', 'Netflix.Com'],
    ['PADARIA 2000', 'PADARIA 2000'],
    ['Posto Ipiranga', 'Posto Ipiranga'],
    ['10 de', '10 de'],
  ])('%s → %s', (key, expected) => {
    expect(suggestRulePattern(key)).toBe(expected);
  });
});
