import {
  mergeCategories,
  normalizeCategoryName,
  type CategoryDef,
  type CustomCategoryType,
} from '@financas/core';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { budgets, categories, rules, transactions } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';

export interface CategoryInfo extends CategoryDef {
  /** só categorias do usuário têm id */
  id?: number;
}

/** Categorias padrão + do usuário. */
export async function loadCategories(db: Db): Promise<CategoryInfo[]> {
  const rows = await db.select().from(categories).orderBy(asc(categories.id));
  const merged = mergeCategories(rows.map((r) => ({ name: r.name, type: r.type })));
  const ids = new Map(rows.map((r) => [r.name, r.id]));
  return merged.map((c) => (c.builtin ? c : { ...c, id: ids.get(c.name) }));
}

export async function assertCategoryExists(db: Db, name: string): Promise<void> {
  const all = await loadCategories(db);
  if (!all.some((c) => c.name === name)) throw badRequest(`Categoria "${name}" não existe.`);
}

async function assertNameFree(db: Db, name: string, exceptId?: number) {
  const all = await loadCategories(db);
  const clash = all.find(
    (c) =>
      normalizeCategoryName(c.name) === normalizeCategoryName(name) &&
      (exceptId === undefined || c.id !== exceptId),
  );
  if (clash) throw badRequest(`Já existe a categoria "${clash.name}".`);
}

export async function createCategory(db: Db, name: string, type: CustomCategoryType) {
  await assertNameFree(db, name);
  const [row] = await db.insert(categories).values({ name, type }).returning();
  if (!row) throw new Error('Não foi possível criar a categoria');
  return row;
}

/** Renomeia e/ou troca o tipo. Renomear leva junto regras, categorias manuais e meta. */
export async function updateCategory(
  db: Db,
  id: number,
  patch: { name?: string; type?: CustomCategoryType },
) {
  const [current] = await db.select().from(categories).where(eq(categories.id, id));
  if (!current) throw notFound('Categoria não encontrada.');
  const name = patch.name ?? current.name;
  if (name !== current.name) await assertNameFree(db, name, id);

  return db.transaction(async (trx) => {
    const [row] = await trx
      .update(categories)
      .set({ name, type: patch.type ?? current.type })
      .where(eq(categories.id, id))
      .returning();
    if (name !== current.name) {
      await trx.update(rules).set({ category: name }).where(eq(rules.category, current.name));
      await trx
        .update(transactions)
        .set({ categoryManual: name })
        .where(eq(transactions.categoryManual, current.name));
      await trx.update(budgets).set({ category: name }).where(eq(budgets.category, current.name));
    }
    if (patch.type === 'entrada') {
      // entrada não tem meta
      await trx.delete(budgets).where(eq(budgets.category, name));
    }
    return row;
  });
}

/**
 * Apaga a categoria. As regras dela são removidas e os lançamentos marcados
 * manualmente com ela voltam a ser categorizados pelas regras.
 */
export async function deleteCategory(db: Db, id: number) {
  const [current] = await db.select().from(categories).where(eq(categories.id, id));
  if (!current) throw notFound('Categoria não encontrada.');
  await db.transaction(async (trx) => {
    await trx.delete(rules).where(eq(rules.category, current.name));
    await trx
      .update(transactions)
      .set({ categoryManual: null })
      .where(eq(transactions.categoryManual, current.name));
    await trx.delete(budgets).where(eq(budgets.category, current.name));
    await trx.delete(categories).where(eq(categories.id, id));
  });
}
