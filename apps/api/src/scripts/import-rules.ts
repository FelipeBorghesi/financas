/**
 * Importa regras de um arquivo JSON para o banco (como regras do usuário).
 * Útil para regras com nomes de pessoas, que não devem ficar no código.
 *
 * Uso: npm run import-rules -- regras-pessoais.json
 * Formato: veja regras-pessoais.example.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { loadCategories } from '../services/categories.js';
import { upsertRule } from '../services/rules.js';

const RulesFile = z.array(
  z.object({
    pattern: z.string().trim().min(2),
    category: z.string().trim().min(1),
    field: z.enum(['key', 'desc']).optional(),
    onlyNegative: z.boolean().optional(),
  }),
);

async function main() {
  const file = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!file) throw new Error('Informe o arquivo: npm run import-rules -- regras.json');
  if (!url) throw new Error('Defina DATABASE_URL (veja o .env.example).');

  // npm roda o script dentro de apps/api; caminhos relativos partem de onde o comando foi chamado
  const resolved = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const parsed = RulesFile.safeParse(JSON.parse(fs.readFileSync(resolved, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      'Arquivo inválido:\n' +
        parsed.error.issues.map((i) => `  - [${i.path.join('.')}] ${i.message}`).join('\n'),
    );
  }

  const { db, migrate, close } = await createDb(url);
  try {
    await migrate();
    const known = new Set((await loadCategories(db)).map((c) => c.name));
    const unknown = [...new Set(parsed.data.map((r) => r.category))].filter((c) => !known.has(c));
    if (unknown.length) {
      throw new Error(
        `Categorias que não existem: ${unknown.join(', ')}. Crie-as no app antes de importar.`,
      );
    }
    for (const r of parsed.data) await upsertRule(db, r.pattern, r.category, r);
    console.log(`${parsed.data.length} regra(s) importada(s).`);
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
