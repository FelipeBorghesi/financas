/** Converte "-88.66" (ponto decimal, com sinal) em centavos. */
export function parseDotDecimalToCents(raw: string): number {
  const s = raw.trim().replace(/\s+/g, '');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Valor inválido: "${raw}"`);
  }
  return toCents(s);
}

/** Converte valor no formato BR ("1.449,00", "- 1.449,00", "-12,5") em centavos. */
export function parseBrDecimalToCents(raw: string): number {
  const s = raw.trim().replace(/\s+/g, '').replace(/^R\$/, '');
  if (!/^[+-]?\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(s)) {
    throw new Error(`Valor inválido: "${raw}"`);
  }
  return toCents(s.replace(/\./g, '').replace(',', '.'));
}

function toCents(normalized: string): number {
  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Converte um número em reais (ex.: vindo de API) para centavos sem erro de ponto flutuante. */
export function reaisToCents(value: number): number {
  return Math.round(value * 100);
}

/** "1449.00" — valor absoluto com 2 casas, usado em ids. */
export function centsToFixed2(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}
