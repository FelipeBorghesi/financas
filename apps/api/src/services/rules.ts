import type { Category } from '@financas/core';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { rules } from '../db/schema.js';

export interface RuleOptions {
  field?: 'key' | 'desc';
  onlyNegative?: boolean;
}

/** Cria a regra, ou atualiza a que já tem o mesmo texto (sem diferenciar maiúsculas). */
export async function upsertRule(
  db: Db,
  pattern: string,
  category: Category,
  options: RuleOptions = {},
) {
  const values = {
    category,
    field: options.field ?? 'key',
    onlyNegative: options.onlyNegative ?? false,
  };
  const [existing] = await db
    .select()
    .from(rules)
    .where(sql`lower(${rules.pattern}) = lower(${pattern})`);
  if (existing) {
    const [updated] = await db
      .update(rules)
      .set(values)
      .where(eq(rules.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  const [created] = await db
    .insert(rules)
    .values({ pattern, ...values })
    .returning();
  if (!created) throw new Error('Não foi possível criar a regra');
  return created;
}
