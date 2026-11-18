// Junta o processo principal e o servidor da FlyNotes num só ficheiro, e copia a aplicação web já construída.
import { build } from 'esbuild';
import { cpSync, rmSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desk = path.resolve(here, '..');
const root = path.resolve(desk, '..');

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Falta construir a aplicação web: corra "npm run build" na pasta principal.');
  process.exit(1);
}
rmSync(path.join(desk, 'build'), { recursive: true, force: true });
rmSync(path.join(desk, 'web'), { recursive: true, force: true });
cpSync(path.join(root, 'dist'), path.join(desk, 'web'), { recursive: true });
mkdirSync(path.join(desk, 'resources'), { recursive: true });
copyFileSync(path.join(root, 'public', 'icon-512.png'), path.join(desk, 'resources', 'icon.png'));

await build({
  entryPoints: [path.join(desk, 'src', 'main.ts')],
  outfile: path.join(desk, 'build', 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // electron vem do próprio programa; pglite leva ficheiros wasm e vai como dependência normal;
  // os módulos de nuvem (Neon, Vercel Blob) nunca são usados na versão de computador.
  external: ['electron', '@electric-sql/pglite', '@neondatabase/serverless', '@vercel/blob', '@vercel/blob/*', 'vite'],
  nodePaths: [path.join(root, 'node_modules')],
  logLevel: 'warning',
  legalComments: 'none',
});
console.log('Pacote pronto: desktop/build/main.cjs e desktop/web/');
