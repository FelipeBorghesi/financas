import { describe, expect, it } from 'vitest';
import {
  centsToFixed2,
  formatBRL,
  parseBrDecimalToCents,
  parseDotDecimalToCents,
  reaisToCents,
} from './money.js';

describe('money', () => {
  it('ponto decimal com sinal', () => {
    expect(parseDotDecimalToCents('-88.66')).toBe(-8866);
    expect(parseDotDecimalToCents('5000')).toBe(500000);
    expect(parseDotDecimalToCents('0.1')).toBe(10);
    expect(() => parseDotDecimalToCents('1,00')).toThrow();
  });
  it('formato BR', () => {
    expect(parseBrDecimalToCents('1.449,00')).toBe(144900);
    expect(parseBrDecimalToCents('- 1.449,00')).toBe(-144900);
    expect(parseBrDecimalToCents('12,5')).toBe(1250);
    expect(parseBrDecimalToCents('1449,00')).toBe(144900);
    expect(parseBrDecimalToCents('1.234.567,89')).toBe(123456789);
    expect(() => parseBrDecimalToCents('abc')).toThrow();
  });
  it('reais (float) → centavos sem erro de arredondamento', () => {
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(-88.66)).toBe(-8866);
  });
  it('valor absoluto com 2 casas', () => {
    expect(centsToFixed2(-144900)).toBe('1449.00');
    expect(centsToFixed2(705)).toBe('7.05');
  });
  it('formata em R$', () => {
    expect(formatBRL(-144900).replace(/\s/g, ' ')).toBe('-R$ 1.449,00');
  });
});
