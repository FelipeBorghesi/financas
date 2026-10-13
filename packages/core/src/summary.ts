import {
  BUILTIN_CATEGORY_DEFS,
  DEFAULT_BUDGETS_CENTS,
  INVESTMENT_GOAL_KEY,
  type Category,
  type CategoryDef,
  type CategoryType,
} from './categories.js';
import { currentMonth, monthOf } from './dates.js';
import { normalizeKey, type AccountKind } from './merchant.js';

export interface SummaryTransaction {
  date: string;
  amountCents: number;
  category: Category;
  merchantKey: string;
  accountKind: AccountKind;
}

export type BudgetStatus = 'ok' | 'atencao' | 'estourou';

export interface VariableVsBudget {
  category: Category;
  /** gasto líquido (positivo = gastou) */
  spentCents: number;
  budgetCents: number;
  /** spent / budget; null se não há meta (meta 0) */
  ratio: number | null;
  status: BudgetStatus;
}

export interface FixedGroup {
  category: Category;
  merchantKey: string;
  totalCents: number;
  count: number;
}

export interface MonthSummary {
  month: string;
  entradasCents: number;
  fixosCents: number;
  variaveisCents: number;
  gastosCents: number;
  investidoCents: number;
  investmentGoalCents: number;
  sobraCents: number;
  /** soma com sinal por categoria */
  byCategory: Record<Category, number>;
  fixed: FixedGroup[];
  variables: VariableVsBudget[];
  hasConta: boolean;
  hasCartao: boolean;
  /** tem conta mas não cartão, ou vice-versa */
  incomplete: boolean;
  /** o mês ainda não acabou */
  partial: boolean;
  transactionCount: number;
}

export type Budgets = Partial<Record<Category, number>>;

/** Inverte o sinal sem produzir -0. */
const neg = (n: number): number => (n === 0 ? 0 : -n);

/** Sem meta (0) não tem status de alerta. */
export function budgetStatus(spentCents: number, budgetCents: number): BudgetStatus {
  if (budgetCents <= 0) return 'ok';
  const ratio = spentCents / budgetCents;
  if (ratio > 1) return 'estourou';
  if (ratio > 0.85) return 'atencao';
  return 'ok';
}

/** Tipo de cada categoria; categoria desconhecida conta como variável. */
function typeLookup(categories: readonly CategoryDef[]) {
  const map = new Map(categories.map((c) => [c.name, c.type]));
  return (name: Category): CategoryType => map.get(name) ?? 'variavel';
}

export function summarizeMonth(
  month: string,
  transactions: readonly SummaryTransaction[],
  budgets: Budgets = DEFAULT_BUDGETS_CENTS,
  now: Date = new Date(),
  categories: readonly CategoryDef[] = BUILTIN_CATEGORY_DEFS,
): MonthSummary {
  const typeOf = typeLookup(categories);
  const txs = transactions.filter((t) => monthOf(t.date) === month);
  const byCategory: Record<Category, number> = Object.fromEntries(
    categories.map((c) => [c.name, 0]),
  );
  const fixedMap = new Map<string, FixedGroup>();

  for (const t of txs) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amountCents;
    if (typeOf(t.category) === 'fixo') {
      const k = `${t.category}|${normalizeKey(t.merchantKey)}`;
      const g = fixedMap.get(k) ?? {
        category: t.category,
        merchantKey: t.merchantKey,
        totalCents: 0,
        count: 0,
      };
      g.totalCents -= t.amountCents;
      g.count += 1;
      fixedMap.set(k, g);
    }
  }

  const sumOfType = (type: CategoryType) =>
    Object.entries(byCategory).reduce((acc, [c, v]) => (typeOf(c) === type ? acc + v : acc), 0);
  const entradasCents = sumOfType('entrada');
  const fixosCents = neg(sumOfType('fixo'));
  const variaveisCents = neg(sumOfType('variavel'));
  const gastosCents = fixosCents + variaveisCents;

  const variableNames = Object.keys(byCategory).filter((c) => typeOf(c) === 'variavel');
  const variables = variableNames.map((category): VariableVsBudget => {
    const spentCents = neg(byCategory[category] ?? 0);
    const budgetCents = budgets[category] ?? 0;
    return {
      category,
      spentCents,
      budgetCents,
      ratio: budgetCents > 0 ? spentCents / budgetCents : null,
      status: budgetStatus(spentCents, budgetCents),
    };
  });

  const order = categories.map((c) => c.name);
  const fixed = [...fixedMap.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.totalCents - a.totalCents,
  );

  const hasConta = txs.some((t) => t.accountKind === 'conta');
  const hasCartao = txs.some((t) => t.accountKind === 'cartao');

  return {
    month,
    entradasCents,
    fixosCents,
    variaveisCents,
    gastosCents,
    investidoCents: neg(sumOfType('investimento')),
    investmentGoalCents: budgets[INVESTMENT_GOAL_KEY] ?? 0,
    sobraCents: entradasCents - gastosCents,
    byCategory,
    fixed,
    variables,
    hasConta,
    hasCartao,
    incomplete: hasConta !== hasCartao,
    partial: month >= currentMonth(now),
    transactionCount: txs.length,
  };
}

export interface EvolutionPoint {
  month: string;
  entradasCents: number;
  gastosCents: number;
}

/** Meses com lançamentos, do mais antigo ao mais recente. */
export function listMonths(transactions: readonly { date: string }[]): string[] {
  return [...new Set(transactions.map((t) => monthOf(t.date)))].sort();
}

export function buildEvolution(
  transactions: readonly SummaryTransaction[],
  categories: readonly CategoryDef[] = BUILTIN_CATEGORY_DEFS,
): EvolutionPoint[] {
  const typeOf = typeLookup(categories);
  const points = new Map<string, EvolutionPoint>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    const p = points.get(month) ?? { month, entradasCents: 0, gastosCents: 0 };
    const type = typeOf(t.category);
    if (type === 'entrada') p.entradasCents += t.amountCents;
    else if (type === 'fixo' || type === 'variavel') p.gastosCents -= t.amountCents;
    points.set(month, p);
  }
  return [...points.values()].sort((a, b) => a.month.localeCompare(b.month));
}
