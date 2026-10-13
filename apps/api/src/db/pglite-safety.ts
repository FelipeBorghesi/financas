import fs from 'node:fs';
import path from 'node:path';

/**
 * Proteções para o PGlite local. Ele grava num diretório e não aguenta bem:
 * - dois processos abrindo o mesmo diretório;
 * - o processo ser morto no meio de uma escrita (ex.: reinício de `tsx watch` no Windows).
 * Por isso: trava por PID e cópia de segurança do diretório a cada inicialização.
 */

const KEEP_BACKUPS = 5;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Impede que dois processos usem o mesmo banco. Retorna a função que libera a trava. */
export function acquireLock(dataDir: string): () => void {
  const lockFile = `${path.resolve(dataDir)}.lock`;
  try {
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `Outra instância da API (PID ${pid}) já está usando o banco local ${dataDir}. ` +
          'Feche-a antes de abrir esta (dois processos no mesmo PGlite corrompem o banco).',
      );
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  fs.writeFileSync(lockFile, String(process.pid));
  return () => {
    try {
      if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile);
    } catch {
      /* já removida */
    }
  };
}

/** Copia o diretório do banco (fechado) para `<dataDir>-backups/<data-hora>` e mantém só os últimos. */
export function backupDataDir(dataDir: string): string | null {
  const src = path.resolve(dataDir);
  if (!fs.existsSync(path.join(src, 'PG_VERSION'))) return null; // banco ainda não existe
  const root = `${src}-backups`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(root, stamp);
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, filter: (f) => path.basename(f) !== 'postmaster.pid' });

  const all = fs.readdirSync(root).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(root, old), { recursive: true, force: true });
  }
  return dest;
}

/** Mensagem útil quando o PGlite não abre. */
export function openErrorMessage(dataDir: string, err: unknown): string {
  const backups = `${path.resolve(dataDir)}-backups`;
  return (
    `Não foi possível abrir o banco local (${dataDir}): ${err instanceof Error ? err.message : String(err)}\n` +
    'Ele pode ter sido corrompido por um encerramento forçado. Para voltar ao último estado bom:\n' +
    `  1. Pare a API.\n  2. Renomeie ${dataDir} (não apague).\n` +
    `  3. Copie a pasta mais recente de ${backups} para ${dataDir}.\n` +
    'Veja "Banco local" no README.'
  );
}
