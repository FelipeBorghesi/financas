import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import bcrypt from 'bcryptjs';

/** Gera o hash bcrypt da senha para APP_PASSWORD_HASH. Uso: npm run hash-password [-- senha] */
async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout });
    password = await rl.question('Senha: ');
    rl.close();
  }
  if (!password || password.length < 10) {
    console.error('Use uma senha com pelo menos 10 caracteres.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log(`\nAPP_PASSWORD_HASH=${hash}\n`);
  console.log('Cole a linha acima no .env (ou nas variáveis de ambiente da plataforma).');
  console.log('No .env, coloque o valor entre aspas simples por causa dos "$".');
}

void main();
