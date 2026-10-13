import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import { badRequest } from '../lib/errors.js';
import { importCsv, type CsvImportSummary } from '../services/csv-import.js';

export async function importRoutes(app: FastifyInstance, opts: { db: Db }) {
  app.post('/api/import/csv', async (req) => {
    if (!req.isMultipart()) throw badRequest('Envie os arquivos CSV como multipart/form-data.');
    const results: (CsvImportSummary | { fileName: string; error: string })[] = [];
    for await (const part of req.files()) {
      const buf = await part.toBuffer();
      const fileName = part.filename || 'arquivo.csv';
      try {
        results.push(await importCsv(opts.db, fileName, buf.toString('utf8')));
      } catch (e) {
        results.push({
          fileName,
          error: e instanceof Error ? e.message : 'Erro ao ler o arquivo.',
        });
      }
    }
    if (results.length === 0) throw badRequest('Nenhum arquivo enviado.');
    return { results };
  });
}
