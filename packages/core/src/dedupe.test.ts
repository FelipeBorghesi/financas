import { describe, expect, it } from 'vitest';
import { findDuplicate, type DedupeCandidate } from './dedupe.js';

const c = (
  id: string,
  date: string,
  amountCents: number,
  merchantKey: string,
): DedupeCandidate & { id: string } => ({
  id,
  accountKind: 'cartao',
  date,
  amountCents,
  merchantKey,
});

describe('findDuplicate', () => {
  const candidates = [
    c('a', '2026-08-01', -1000, 'Padaria Boa'),
    c('b', '2026-08-01', -1000, 'Cinema'),
    c('d', '2026-08-02', -5000, 'Loja'),
  ];

  it('casa por data + valor quando há um único candidato', () => {
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-02', amountCents: -5000, merchantKey: 'LOJA*X' },
        candidates,
      )?.id,
    ).toBe('d');
  });
  it('desempata pela chave', () => {
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-01', amountCents: -1000, merchantKey: 'CINEMA' },
        candidates,
      )?.id,
    ).toBe('b');
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-01', amountCents: -1000, merchantKey: 'Padaria' },
        candidates,
      )?.id,
    ).toBe('a');
  });
  it('não casa com outra conta, data ou valor', () => {
    expect(
      findDuplicate(
        { accountKind: 'conta', date: '2026-08-02', amountCents: -5000, merchantKey: 'Loja' },
        candidates,
      ),
    ).toBeUndefined();
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-03', amountCents: -5000, merchantKey: 'Loja' },
        candidates,
      ),
    ).toBeUndefined();
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-02', amountCents: -5001, merchantKey: 'Loja' },
        candidates,
      ),
    ).toBeUndefined();
  });
  it('ambíguo sem chave parecida: não casa', () => {
    expect(
      findDuplicate(
        { accountKind: 'cartao', date: '2026-08-01', amountCents: -1000, merchantKey: 'Outro' },
        candidates,
      ),
    ).toBeUndefined();
  });
});
