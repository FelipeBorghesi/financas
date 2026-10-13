export type CategoryType = 'entrada' | 'fixo' | 'variavel' | 'investimento' | 'ignorar';

/** Nome da categoria. As padrão estão em BUILTIN_CATEGORIES; o usuário pode criar outras. */
export type Category = string;

export interface CategoryDef {
  name: Category;
  type: CategoryType;
  /** categoria padrão (não pode ser renomeada nem apagada) */
  builtin: boolean;
}

export const BUILTIN_CATEGORIES = [
  'Salário',
  'Outras entradas',
  'Moradia',
  'Assinaturas',
  'Academia',
  'Alimentação fora',
  'Mercado e padaria',
  'Lazer',
  'Compras',
  'Cuidados pessoais',
  'Pix p/ pessoas',
  'Impostos e taxas',
  'Outros',
  'Investimento',
  'Pagamento de fatura',
] as const;

export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export const BUILTIN_CATEGORY_TYPE: Record<BuiltinCategory, CategoryType> = {
  Salário: 'entrada',
  'Outras entradas': 'entrada',
  Moradia: 'fixo',
  Assinaturas: 'fixo',
  Academia: 'fixo',
  'Alimentação fora': 'variavel',
  'Mercado e padaria': 'variavel',
  Lazer: 'variavel',
  Compras: 'variavel',
  'Cuidados pessoais': 'variavel',
  'Pix p/ pessoas': 'variavel',
  'Impostos e taxas': 'variavel',
  Outros: 'variavel',
  Investimento: 'investimento',
  'Pagamento de fatura': 'ignorar',
};

export const BUILTIN_CATEGORY_DEFS: readonly CategoryDef[] = BUILTIN_CATEGORIES.map((name) => ({
  name,
  type: BUILTIN_CATEGORY_TYPE[name],
  builtin: true,
}));

/** Tipos que o usuário pode escolher ao criar uma categoria. */
export const CUSTOM_CATEGORY_TYPES = ['fixo', 'variavel', 'entrada'] as const;
export type CustomCategoryType = (typeof CUSTOM_CATEGORY_TYPES)[number];

/** Chave usada em `budgets` para a meta de aporte mensal. */
export const INVESTMENT_GOAL_KEY = 'Investimento';

/** Metas padrão em centavos por mês. */
export const DEFAULT_BUDGETS_CENTS: Readonly<Record<string, number>> = {
  Moradia: 155000,
  Assinaturas: 16000,
  Academia: 16000,
  'Alimentação fora': 40000,
  'Mercado e padaria': 30000,
  Lazer: 15000,
  Compras: 10000,
  'Cuidados pessoais': 6000,
  'Pix p/ pessoas': 15000,
  'Impostos e taxas': 4000,
  Outros: 10000,
  Investimento: 50000,
};

export function isBuiltinCategory(value: string): value is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(value);
}

/** Tipos de categoria que têm meta mensal. */
export function hasBudget(type: CategoryType): boolean {
  return type === 'fixo' || type === 'variavel' || type === 'investimento';
}

/** Junta as categorias padrão com as do usuário (as padrão primeiro). */
export function mergeCategories(custom: readonly Omit<CategoryDef, 'builtin'>[]): CategoryDef[] {
  return [...BUILTIN_CATEGORY_DEFS, ...custom.map((c) => ({ ...c, builtin: false }))];
}

/** Normaliza o nome para comparar sem diferenciar maiúsculas/acentos/espaços. */
export function normalizeCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
