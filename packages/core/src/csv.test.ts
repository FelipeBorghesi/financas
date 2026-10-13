import { describe, expect, it } from 'vitest';
import { detectCsvKind, parseCsv, parseNubankCsv } from './csv.js';

describe('parseCsv', () => {
  it('trata aspas, "" escapado, vírgula e quebra de linha entre aspas', () => {
    expect(parseCsv('a,"b,c","d ""e""","f\ng"\n1,2,3,4')).toEqual([
      ['a', 'b,c', 'd "e"', 'f\ng'],
      ['1', '2', '3', '4'],
    ]);
  });
  it('remove BOM e aceita CRLF e linha final vazia', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('mantém campo vazio no fim', () => {
    expect(parseCsv('a,b,\n')).toEqual([['a', 'b', '']]);
  });
});

describe('detectCsvKind', () => {
  it('reconhece os cabeçalhos', () => {
    expect(detectCsvKind(['Data', 'Valor', 'Identificador', 'Descrição'])).toBe('conta');
    expect(detectCsvKind(['date', 'title', 'amount'])).toBe('cartao');
    expect(detectCsvKind(['foo'])).toBeNull();
  });
});

describe('parseNubankCsv — extrato da conta', () => {
  const csv = [
    '﻿Data,Valor,Identificador,Descrição',
    '01/08/2026,-88.66,6a6ea091-0000-4000-8000-000000000001,Compra no débito - CarlosRoberto',
    '02/08/2026,5000.00,6a6ea091-0000-4000-8000-000000000002,"Transferência recebida pelo Pix - FULANO - •••.123.456-•• - BANCO, S.A."',
    '03/08/2026,-0.5,6a6ea091-0000-4000-8000-000000000003,Pagamento de fatura',
  ].join('\n');

  it('lê data, valor com sinal, id e chave', () => {
    const r = parseNubankCsv(csv);
    expect(r.kind).toBe('conta');
    expect(r.errors).toEqual([]);
    expect(r.transactions).toEqual([
      {
        externalId: '6a6ea091-0000-4000-8000-000000000001',
        accountKind: 'conta',
        date: '2026-08-01',
        amountCents: -8866,
        description: 'Compra no débito - CarlosRoberto',
        merchantKey: 'CarlosRoberto',
      },
      expect.objectContaining({
        date: '2026-08-02',
        amountCents: 500000,
        description: 'Transferência recebida pelo Pix - FULANO - •••.123.456-•• - BANCO, S.A.',
        merchantKey: 'FULANO',
      }),
      expect.objectContaining({ amountCents: -50, merchantKey: 'Pagamento de fatura' }),
    ]);
  });

  it('reporta linhas inválidas sem perder as boas', () => {
    const r = parseNubankCsv(
      'Data,Valor,Identificador,Descrição\n32/08/2026,-1.00,x,Y\n01/08/2026,abc,y,Z\n01/08/2026,-1.00,z,W',
    );
    expect(r.transactions).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});

describe('parseNubankCsv — fatura do cartão', () => {
  const csv = [
    'date,title,amount',
    '2026-08-05,Loja X,"1.449,00"',
    '2026-08-06,Pagamento recebido,"- 1.449,00"',
    '2026-08-07,Padaria,"12,50"',
    '2026-08-07,Padaria,"12,50"',
    '2026-08-07,Padaria,"7,00"',
  ].join('\n');

  it('inverte o sinal: compra vira saída', () => {
    const r = parseNubankCsv(csv);
    expect(r.kind).toBe('cartao');
    expect(r.errors).toEqual([]);
    expect(r.transactions.map((t) => t.amountCents)).toEqual([-144900, 144900, -1250, -1250, -700]);
  });

  it('gera id c|data|título|valor|n, com n por ocorrência repetida', () => {
    const r = parseNubankCsv(csv);
    expect(r.transactions.map((t) => t.externalId)).toEqual([
      'c|2026-08-05|Loja X|1449.00|1',
      'c|2026-08-06|Pagamento recebido|1449.00|1',
      'c|2026-08-07|Padaria|12.50|1',
      'c|2026-08-07|Padaria|12.50|2',
      'c|2026-08-07|Padaria|7.00|1',
    ]);
  });

  it('chave do cartão é o título', () => {
    expect(parseNubankCsv(csv).transactions[0]?.merchantKey).toBe('Loja X');
  });
});

describe('parseNubankCsv — formato desconhecido', () => {
  it('lança erro com instrução', () => {
    expect(() => parseNubankCsv('x,y\n1,2')).toThrow(/Formato de CSV não reconhecido/);
  });
});
