export type AccountKind = 'conta' | 'cartao';

const SEP = ' - ';

/**
 * Nome do estabelecimento/pessoa ("chave") usado pelas regras.
 * - conta: trecho entre o primeiro " - " e o próximo ("Compra no débito - PadariaBrasil" → "PadariaBrasil");
 *   sem " - ", a descrição inteira.
 * - cartão: o título.
 */
export function merchantKeyFor(kind: AccountKind, description: string): string {
  const desc = description.trim();
  if (kind === 'cartao') return desc;
  const start = desc.indexOf(SEP);
  if (start === -1) return desc;
  const rest = desc.slice(start + SEP.length);
  const end = rest.indexOf(SEP);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** Normalização para comparar chaves (dedupe, agrupamento). */
export function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Texto sugerido para "Aplicar a todos": a chave sem o número da parcela,
 * para a regra pegar os outros meses também.
 * "Seguradora X*10 de" → "Seguradora X"; "Loja X 3/10" → "Loja X".
 */
export function suggestRulePattern(merchantKey: string): string {
  const key = merchantKey.trim();
  const s = key
    .replace(/\s*[-–]?\s*(parc(ela)?\.?\s*)?\d{1,2}\s*(de|\/)\s*\d{0,2}\s*$/i, '')
    .replace(/[\s*\-–]+$/, '');
  return s.length >= 2 ? s : key;
}
