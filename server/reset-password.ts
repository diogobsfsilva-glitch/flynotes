// Instalação local: repõe a password para a que está no ficheiro .env (apaga a password alterada dentro da aplicação).
// Não toca nas notas. Usar com a aplicação parada:  npm run reset-password
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
const env: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
  }
}
const dir = path.resolve(root, process.env.FLYNOTES_DATA_DIR || env.FLYNOTES_DATA_DIR || '.data');
if (!existsSync(path.join(dir, 'pg'))) {
  console.log(`Não encontrei dados em ${dir}. Nada a fazer.`);
  process.exit(0);
}
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite(path.join(dir, 'pg'));
await db.query(`delete from app_meta where key = 'password_hash'`);
await db.query(`delete from login_fails`).catch(() => {});
await db.close();
console.log('\nPassword reposta. As notas não foram alteradas.');
console.log(env.FLYNOTES_PASSWORD ? `A password volta a ser a do ficheiro .env:  ${env.FLYNOTES_PASSWORD}\n` : 'Defina FLYNOTES_PASSWORD=... no ficheiro .env e volte a iniciar a aplicação.\n');
