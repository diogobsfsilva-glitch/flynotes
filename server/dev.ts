// Servidor local de linha de comandos: emula as funções Vercel (/api/*) e serve o frontend
// (Vite em desenvolvimento, dist/ com --preview). `npm start` usa este ficheiro.
import os from 'node:os';
import path from 'node:path';
import { loadConfig, startServer } from './app.js';

const root = path.resolve(import.meta.dirname, '..');
const { firstRun } = loadConfig(path.join(root, '.env'));

const PORT = Number(process.env.PORT || 5173);
const PREVIEW = process.argv.includes('--preview');

let fallback: ((req: any, res: any) => void) | undefined;
if (!PREVIEW) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  fallback = (req, res) => vite.middlewares(req, res);
}

try {
  await startServer({ port: PORT, webDir: path.join(root, 'dist'), fallback });
} catch (e: any) {
  if (e?.code === 'EADDRINUSE') console.error(`\nA porta ${PORT} já está em uso. Feche a outra FlyNotes ou acrescente PORT=5180 ao ficheiro .env.\n`);
  else console.error(e);
  process.exit(1);
}

const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
console.log(`\nFlyNotes ${PREVIEW ? '' : '(desenvolvimento) '}a funcionar.`);
console.log(`  Neste computador:       http://localhost:${PORT}`);
if (lan) console.log(`  Na mesma rede Wi-Fi:    http://${lan}:${PORT}`);
if (firstRun) console.log(`\n  Foi criada uma password para si:  ${process.env.FLYNOTES_PASSWORD}\n  Fica guardada no ficheiro .env desta pasta. Pode mudá-la depois em Definições → Password.`);
else if (!process.env.FLYNOTES_PASSWORD) console.log('\n  ATENÇÃO: não há password definida. Acrescente FLYNOTES_PASSWORD=... ao ficheiro .env.');
console.log('\n  Para parar: Ctrl+C. Os dados ficam na pasta .data');
