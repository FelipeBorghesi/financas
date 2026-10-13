import { findDuplicate, parseNubankCsv, type AccountKind, type CsvRowError } from '@financas/core';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { accounts, transactions } from '../db/schema.js';
import { getOrCreateAccount } from './transactions.js';

export interface CsvImportSummary {
  fileName: string;
  kind: AccountKind;
  total: number;
  inserted: number;
  /** já importados antes (mesmo id) */
  duplicates: number;
  /** já vieram pela Pluggy (dedupe heurístico) */
  alreadyFromPluggy: number;
  errors: CsvRowError[];
}

export async function importCsv(db: Db, fileName: string, text: string): Promise<CsvImportSummary> {
  const parsed = parseNubankCsv(text);
  const summary: CsvImportSummary = {
    fileName,
    kind: parsed.kind,
    total: parsed.transactions.length,
    inserted: 0,
    duplicates: 0,
    alreadyFromPluggy: 0,
    errors: parsed.errors,
  };
  if (parsed.transactions.length === 0) return summary;

  const account = await getOrCreateAccount(db, parsed.kind);
  const dates = parsed.transactions.map((t) => t.date).sort();
  const pluggyRows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchantKey: transactions.merchantKey,
      accountKind: accounts.kind,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.source, 'pluggy'),
        eq(accounts.kind, parsed.kind),
        gte(transactions.date, dates[0] ?? ''),
        lte(transactions.date, dates[dates.length - 1] ?? ''),
      ),
    );
  // Cada lançamento da Pluggy só "absorve" um do CSV.
  const pluggyPool = [...pluggyRows];

  await db.transaction(async (trx) => {
    for (const t of parsed.transactions) {
      const dup = findDuplicate(t, pluggyPool);
      if (dup) {
        pluggyPool.splice(pluggyPool.indexOf(dup), 1);
        summary.alreadyFromPluggy++;
        continue;
      }
      const inserted = await trx
        .insert(transactions)
        .values({
          accountId: account.id,
          source: 'csv',
          externalId: t.externalId,
          date: t.date,
          amountCents: t.amountCents,
          description: t.description,
          merchantKey: t.merchantKey,
        })
        .onConflictDoNothing({ target: [transactions.source, transactions.externalId] })
        .returning({ id: transactions.id });
      if (inserted.length > 0) summary.inserted++;
      else summary.duplicates++;
    }
  });

  return summary;
}
