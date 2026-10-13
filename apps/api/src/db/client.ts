import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { acquireLock, backupDataDir, openErrorMessage } from './pglite-safety.js';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export interface DbHandle {
  db: Db;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * `postgres://…` usa o Postgres de verdade.
 * `pglite:<pasta>` usa o PGlite (Postgres embutido em arquivo), útil para rodar local sem Docker.
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const dataDir = url.slice('pglite:'.length) || './.pglite';
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const release = acquireLock(dataDir);
    backupDataDir(dataDir);
    let client: InstanceType<typeof PGlite>;
    try {
      client = new PGlite(dataDir);
      await client.waitReady;
    } catch (err) {
      release();
      throw new Error(openErrorMessage(dataDir, err), { cause: err });
    }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Db,
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: async () => {
        await client.close();
        release();
      },
    };
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db: db as Db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.end({ timeout: 5 }),
  };
}
