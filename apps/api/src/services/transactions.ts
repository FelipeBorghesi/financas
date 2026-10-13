import {
  categorize,
  type AccountKind,
  type Category,
  type CategorySource,
  type Rule,
  type SummaryTransaction,
} from '@financas/core';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { accounts, rules, transactions } from '../db/schema.js';
import { loadCategories } from './categories.js';

export interface CategorizedTransaction extends SummaryTransaction {
  id: number;
  description: string;
  source: 'pluggy' | 'csv';
  categorySource: CategorySource;
  categoryManual: Category | null;
}

export async function loadUserRules(db: Db, known?: Set<string>): Promise<Rule[]> {
  const names = known ?? new Set((await loadCategories(db)).map((c) => c.name));
  const rows = await db.select().from(rules).orderBy(asc(rules.id));
  return rows.flatMap((r) =>
    names.has(r.category)
      ? [
          {
            pattern: r.pattern,
            category: r.category,
            field: r.field,
            onlyNegative: r.onlyNegative,
          },
        ]
      : [],
  );
}

/** Todos os lançamentos com a categoria final calculada (manual ?? regras). */
export async function loadCategorizedTransactions(db: Db): Promise<CategorizedTransaction[]> {
  const known = new Set((await loadCategories(db)).map((c) => c.name));
  const [rows, userRules] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.description,
        merchantKey: transactions.merchantKey,
        categoryManual: transactions.categoryManual,
        source: transactions.source,
        accountKind: accounts.kind,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .orderBy(asc(transactions.date), asc(transactions.id)),
    loadUserRules(db, known),
  ]);

  return rows.map((r) => {
    const categoryManual =
      r.categoryManual && known.has(r.categoryManual) ? r.categoryManual : null;
    const c = categorize({ ...r, categoryManual }, userRules);
    return {
      ...r,
      accountKind: r.accountKind as AccountKind,
      categoryManual,
      category: c.category,
      categorySource: c.source,
    };
  });
}

const DEFAULT_ACCOUNT_NAME: Record<AccountKind, string> = {
  conta: 'Nubank — conta',
  cartao: 'Nubank — cartão',
};

/** Conta do tipo pedido; cria uma se ainda não existir. */
export async function getOrCreateAccount(db: Db, kind: AccountKind) {
  const [existing] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.kind, kind))
    .orderBy(asc(accounts.id))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(accounts)
    .values({ kind, name: DEFAULT_ACCOUNT_NAME[kind] })
    .returning();
  if (!created) throw new Error('Não foi possível criar a conta');
  return created;
}
