import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  pluggyAccountId: text('pluggy_account_id').unique(),
  kind: text('kind', { enum: ['conta', 'cartao'] }).notNull(),
  name: text('name').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['pluggy', 'csv'] }).notNull(),
    externalId: text('external_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    merchantKey: text('merchant_key').notNull(),
    categoryManual: text('category_manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_source_external_id').on(t.source, t.externalId),
    index('transactions_date').on(t.date),
  ],
);

export const rules = pgTable(
  'rules',
  {
    id: serial('id').primaryKey(),
    pattern: text('pattern').notNull(),
    category: text('category').notNull(),
    /** onde procurar: 'key' = nome do estabelecimento/pessoa, 'desc' = descrição inteira */
    field: text('field', { enum: ['key', 'desc'] })
      .notNull()
      .default('key'),
    /** só casa com saídas (valores negativos) */
    onlyNegative: boolean('only_negative').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rules_pattern_lower').on(sql`lower(${t.pattern})`)],
);

/** Metas mensais por categoria. A meta de aporte usa a categoria "Investimento". */
export const budgets = pgTable('budgets', {
  category: text('category').primaryKey(),
  amountCents: integer('amount_cents').notNull(),
});

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  trigger: text('trigger', { enum: ['cron', 'manual'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  newCount: integer('new_count').notNull().default(0),
  error: text('error'),
});

/** Categorias criadas pelo usuário. As padrão ficam no código (packages/core). */
export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: ['fixo', 'variavel', 'entrada'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_name_lower').on(sql`lower(${t.name})`)],
);
