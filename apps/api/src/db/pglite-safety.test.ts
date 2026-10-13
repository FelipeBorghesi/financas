import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireLock, backupDataDir } from './pglite-safety.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-safety-'));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('recusa quando outro processo vivo segura a trava', () => {
    const root = tmp();
    dirs.push(root);
    const dataDir = path.join(root, 'db');
    // o processo pai (vivo) "segura" o banco
    fs.writeFileSync(`${dataDir}.lock`, String(process.ppid));
    expect(() => acquireLock(dataDir)).toThrow(/Outra instância da API/);
  });

  it('assume trava velha de processo morto e libera ao fechar', () => {
    const root = tmp();
    dirs.push(root);
    const dataDir = path.join(root, 'db');
    fs.writeFileSync(`${dataDir}.lock`, '999999');
    const release = acquireLock(dataDir);
    expect(fs.readFileSync(`${dataDir}.lock`, 'utf8')).toBe(String(process.pid));
    release();
    expect(fs.existsSync(`${dataDir}.lock`)).toBe(false);
  });
});

describe('backupDataDir', () => {
  it('não faz nada se o banco ainda não existe', () => {
    const root = tmp();
    dirs.push(root);
    expect(backupDataDir(path.join(root, 'db'))).toBeNull();
  });

  it('copia o diretório sem a trava do postgres e mantém só os 5 últimos', () => {
    const root = tmp();
    dirs.push(root);
    const dataDir = path.join(root, 'db');
    fs.mkdirSync(path.join(dataDir, 'base'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '18');
    fs.writeFileSync(path.join(dataDir, 'base', 'x'), 'dados');
    fs.writeFileSync(path.join(dataDir, 'postmaster.pid'), '-42');

    const backups = `${dataDir}-backups`;
    fs.mkdirSync(backups);
    for (let i = 0; i < 6; i++) fs.mkdirSync(path.join(backups, `2000-01-0${i + 1}T00-00-00`));

    const dest = backupDataDir(dataDir)!;
    expect(fs.readFileSync(path.join(dest, 'base', 'x'), 'utf8')).toBe('dados');
    expect(fs.existsSync(path.join(dest, 'postmaster.pid'))).toBe(false);
    const kept = fs.readdirSync(backups).sort();
    expect(kept).toHaveLength(5);
    expect(kept.at(-1)).toBe(path.basename(dest));
  });
});
