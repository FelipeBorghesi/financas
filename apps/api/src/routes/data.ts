import {
  CUSTOM_CATEGORY_TYPES,
  DEFAULT_BUDGETS_CENTS,
  buildEvolution,
  currentMonth,
  hasBudget,
  listMonths,
  suggestRulePattern,
  summarizeMonth,
  type Budgets,
} from '@financas/core';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { budgets, rules, transactions } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  assertCategoryExists,
  createCategory,
  deleteCategory,
  loadCategories,
  updateCategory,
} from '../services/categories.js';
import { upsertRule } from '../services/rules.js';
import { loadCategorizedTransactions } from '../services/transactions.js';

const MonthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato aaaa-mm');
const CategoryName = z.string().trim().min(1, 'Informe a categoria').max(60);
const NewCategoryName = z
  .string()
  .trim()
  .min(2, 'O nome da categoria precisa ter pelo menos 2 letras')
  .max(40, 'Nome de categoria muito longo (máx. 40)');
const CustomType = z.enum(CUSTOM_CATEGORY_TYPES, 'Tipo inválido: use fixo, variavel ou entrada');
const IdParam = z.object({ id: z.coerce.number().int().positive() });

export async function loadBudgets(db: Db): Promise<Budgets> {
  const [rows, cats] = await Promise.all([db.select().from(budgets), loadCategories(db)]);
  const withBudget = new Set(cats.filter((c) => hasBudget(c.type)).map((c) => c.name));
  const result: Budgets = {};
  for (const [k, v] of Object.entries(DEFAULT_BUDGETS_CENTS)) if (withBudget.has(k)) result[k] = v;
  for (const r of rows) if (withBudget.has(r.category)) result[r.category] = r.amountCents;
  return result;
}

export async function dataRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // ---- categorias ----

  app.get('/api/categories', async () => loadCategories(db));

  app.post('/api/categories', async (req) => {
    const body = z.object({ name: NewCategoryName, type: CustomType }).parse(req.body);
    return createCategory(db, body.name, body.type);
  });

  app.patch('/api/categories/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = z
      .object({ name: NewCategoryName.optional(), type: CustomType.optional() })
      .parse(req.body);
    return updateCategory(db, id, body);
  });

  app.delete('/api/categories/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    await deleteCategory(db, id);
    return { ok: true };
  });

  // ---- meses e resumo ----

  app.get('/api/months', async () => {
    const txs = await loadCategorizedTransactions(db);
    return { months: listMonths(txs), current: currentMonth() };
  });

  app.get('/api/summary', async (req) => {
    const { month } = z.object({ month: MonthParam }).parse(req.query);
    const [txs, b, cats] = await Promise.all([
      loadCategorizedTransactions(db),
      loadBudgets(db),
      loadCategories(db),
    ]);
    return {
      summary: summarizeMonth(month, txs, b, new Date(), cats),
      evolution: buildEvolution(txs, cats),
    };
  });

  // ---- lançamentos ----

  app.get('/api/transactions', async (req) => {
    const q = z
      .object({
        month: MonthParam.optional(),
        q: z.string().max(200).optional(),
        category: CategoryName.optional(),
      })
      .parse(req.query);
    const needle = q.q?.trim().toLowerCase();
    const txs = (await loadCategorizedTransactions(db)).filter(
      (t) =>
        (!q.month || t.date.startsWith(q.month)) &&
        (!q.category || t.category === q.category) &&
        (!needle || t.description.toLowerCase().includes(needle)),
    );
    return txs.reverse();
  });

  app.patch('/api/transactions/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = z
      .object({
        category: CategoryName.nullable(),
        applyToAll: z.boolean().default(false),
        /** texto da regra em "Aplicar a todos"; padrão: a chave sem o número da parcela */
        pattern: z
          .string()
          .trim()
          .min(2, 'O texto da regra precisa ter 2+ letras')
          .max(200)
          .optional(),
      })
      .parse(req.body);

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!tx) throw notFound('Lançamento não encontrado.');
    if (body.category) await assertCategoryExists(db, body.category);

    if (body.applyToAll) {
      if (!body.category) throw badRequest('Escolha uma categoria para aplicar a todos.');
      const pattern = body.pattern ?? suggestRulePattern(tx.merchantKey);
      if (!pattern) {
        throw badRequest('Esse lançamento não tem nome de estabelecimento para criar a regra.');
      }
      if (!tx.merchantKey.toLowerCase().includes(pattern.toLowerCase())) {
        throw badRequest(
          `O texto "${pattern}" não aparece em "${tx.merchantKey}". Use um trecho do nome.`,
        );
      }
      const category = body.category;
      await db.transaction(async (trx) => {
        await upsertRule(trx, pattern, category);
        // A regra passa a valer para este lançamento também.
        await trx.update(transactions).set({ categoryManual: null }).where(eq(transactions.id, id));
      });
      return { ok: true, rule: { pattern, category } };
    }

    await db
      .update(transactions)
      .set({ categoryManual: body.category })
      .where(eq(transactions.id, id));
    return { ok: true };
  });

  // ---- metas ----

  app.get('/api/budgets', async () => loadBudgets(db));

  app.put('/api/budgets', async (req) => {
    const body = z.record(z.string(), z.number().int().min(0).max(100_000_000)).parse(req.body);
    const cats = await loadCategories(db);
    const entries = Object.entries(body);
    for (const [category] of entries) {
      const def = cats.find((c) => c.name === category);
      if (!def || !hasBudget(def.type)) throw badRequest(`"${category}" não tem meta.`);
    }
    await db.transaction(async (trx) => {
      for (const [category, amountCents] of entries) {
        await trx
          .insert(budgets)
          .values({ category, amountCents })
          .onConflictDoUpdate({ target: budgets.category, set: { amountCents } });
      }
    });
    return loadBudgets(db);
  });

  // ---- regras ----

  app.get('/api/rules', async () => db.select().from(rules).orderBy(asc(rules.id)));

  app.post('/api/rules', async (req) => {
    const body = z
      .object({
        pattern: z.string().trim().min(2).max(200),
        category: CategoryName,
        field: z.enum(['key', 'desc']).optional(),
        onlyNegative: z.boolean().optional(),
      })
      .parse(req.body);
    await assertCategoryExists(db, body.category);
    return upsertRule(db, body.pattern, body.category, body);
  });

  app.delete('/api/rules/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const deleted = await db.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id });
    if (deleted.length === 0) throw notFound('Regra não encontrada.');
    return { ok: true };
  });
}
