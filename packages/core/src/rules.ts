import type { Category } from './categories.js';

/**
 * Regra de categorização. Casa por substring, sem diferenciar maiúsculas/minúsculas.
 * - `field: 'key'` (padrão): procura só na chave (nome do estabelecimento/pessoa).
 * - `field: 'desc'`: procura na descrição inteira.
 */
export interface Rule {
  pattern: string;
  category: Category;
  field?: 'key' | 'desc';
  /** Só casa com valores negativos (saídas). */
  onlyNegative?: boolean;
}

const key = (category: Category, ...patterns: string[]): Rule[] =>
  patterns.map((pattern) => ({ pattern, category }));
const desc = (category: Category, ...patterns: string[]): Rule[] =>
  patterns.map((pattern) => ({ pattern, category, field: 'desc' as const }));

/**
 * Regras padrão. A primeira que casar vence.
 * Regras com nomes de pessoas ou lugares específicos ficam no banco (regras do usuário),
 * não aqui — veja regras-pessoais.example.json.
 */
export const DEFAULT_RULES: readonly Rule[] = [
  // Pagamentos, investimentos e entradas
  ...desc('Pagamento de fatura', 'Pagamento de fatura', 'Pagamento recebido'),
  ...key('Investimento', 'RDB', 'Caixinha'),
  ...key('Outras entradas', 'Crédito em conta'), // rendimentos

  // Impostos
  ...key('Impostos e taxas', 'SECRETARIA DE ESTADO DA FAZENDA', 'DETRAN'),

  // Assinaturas
  ...key(
    'Assinaturas',
    'Amazonprime',
    'Anthropic',
    'Apple.Com',
    'Linkedin',
    'Ifood Club',
    'Netflix',
    'Spotify',
    'Disney',
    'Youtube',
    'Hbomax',
  ),

  // Gastos do dia a dia
  ...key('Cuidados pessoais', 'BARBE'),
  ...key(
    'Alimentação fora',
    'Ifd*',
    'IFOOD',
    'Cupim',
    'Espeto',
    'Cantina',
    'PIZZARIA',
    'SORVETERIA',
    'BAR ', // com espaço, pra não pegar "BARBEARIA"
    'Restaurante',
  ),
  ...desc('Alimentação fora', 'CONFEITARIA'),
  // "Mercadolivre" contém "MERCADO": precisa vir antes da regra de mercado.
  ...key('Compras', 'Mercadolivre'),
  ...key('Mercado e padaria', 'Padaria', 'MERCADO'),
  ...key('Lazer', 'INGRESSO', 'Cinema'),
  ...key('Compras', 'Tiktok', 'Amazon', 'Shopee'),

  // Pix restantes
  { pattern: 'enviada pelo Pix', category: 'Pix p/ pessoas', field: 'desc', onlyNegative: true },
];

export interface Categorizable {
  description: string;
  merchantKey: string;
  amountCents: number;
  categoryManual?: Category | null;
}

export type CategorySource = 'manual' | 'usuario' | 'padrao' | 'fallback';

export interface Categorization {
  category: Category;
  source: CategorySource;
  /** Regra que casou (regras de usuário ou padrão). */
  rule?: Rule;
}

export function ruleMatches(rule: Rule, tx: Categorizable): boolean {
  if (rule.onlyNegative && tx.amountCents >= 0) return false;
  const haystack = rule.field === 'desc' ? tx.description : tx.merchantKey;
  const needle = rule.pattern.toLowerCase();
  return needle.length > 0 && haystack.toLowerCase().includes(needle);
}

/**
 * Categoria final de um lançamento:
 * 1. manual; 2. regras do usuário; 3. regras padrão; 4. positivo → Outras entradas, negativo → Outros.
 */
export function categorize(
  tx: Categorizable,
  userRules: readonly Rule[] = [],
  defaultRules: readonly Rule[] = DEFAULT_RULES,
): Categorization {
  if (tx.categoryManual) return { category: tx.categoryManual, source: 'manual' };
  for (const rule of userRules) {
    if (ruleMatches(rule, tx)) return { category: rule.category, source: 'usuario', rule };
  }
  for (const rule of defaultRules) {
    if (ruleMatches(rule, tx)) return { category: rule.category, source: 'padrao', rule };
  }
  return { category: tx.amountCents >= 0 ? 'Outras entradas' : 'Outros', source: 'fallback' };
}
