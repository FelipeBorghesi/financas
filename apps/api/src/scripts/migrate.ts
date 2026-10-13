import { createDb } from '../db/client.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (veja o .env.example).');
  process.exit(1);
}
const { migrate, close } = await createDb(url);
await migrate();
await close();
console.log('Migrations aplicadas.');
