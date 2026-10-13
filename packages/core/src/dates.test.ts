import { describe, expect, it } from 'vitest';
import {
  currentMonth,
  dateInSaoPaulo,
  formatMonthLong,
  formatMonthShort,
  parseBrDate,
} from './dates.js';

describe('dates', () => {
  it('dd/mm/aaaa → iso', () => {
    expect(parseBrDate('01/08/2026')).toBe('2026-08-01');
    expect(() => parseBrDate('31/02/2026')).toThrow();
  });
  it('usa o fuso de São Paulo', () => {
    // 02:00 UTC do dia 1º ainda é dia 31 em São Paulo (UTC−3)
    expect(dateInSaoPaulo(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08-31');
    expect(currentMonth(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08');
  });
  it('formata meses em pt-BR', () => {
    expect(formatMonthLong('2026-08')).toBe('agosto de 2026');
    expect(formatMonthShort('2026-10')).toBe('out/26');
  });
});
