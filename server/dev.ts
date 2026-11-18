// Servidor local que emula as funções Vercel (/api/*) e serve o frontend (Vite em dev, dist/ em preview).
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');

// Configuração local em .env (criado no primeiro arranque, com uma password aleatória)
const envFile = path.join(root, '.env');
let firstRun = false;
if (!existsSync(envFile) && !process.env.FLYNOTES_PASSWORD) {
  const words = () => randomBytes(3).toString('hex');
  writeFileSync(envFile, `# Configuração local da FlyNotes (não partilhe este ficheiro)\nFLYNOTES_PASSWORD=${words()}-${words()}-${words()}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\n`);
  firstRun = true;
}
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.PORT || 5173);
const PREVIEW = process.argv.includes('--preview');

async function toRequest(req: http.IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

async function sendResponse(res: http.ServerResponse, r: Response) {
  const headers: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => (headers[k] = v));
  const setCookie = (r.headers as any).getSetCookie?.();
  if (setCookie?.length) headers['set-cookie'] = setCookie;
  res.writeHead(r.status, headers);
  if (r.body) {
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const name = new URL(req.url!, 'http://x').pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z-]+$/.test(name)) return sendResponse(res, new Response('not found', { status: 404 }));
  try {
    const mod = await import(path.join(root, 'api', name + '.ts'));
    const fn = mod[req.method || 'GET'];
    if (!fn) return sendResponse(res, new Response('method not allowed', { status: 405 }));
    await sendResponse(res, await fn(await toRequest(req)));
  } catch (e: any) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND') return sendResponse(res, new Response('not found', { status: 404 }));
    console.error(e);
    sendResponse(res, new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 }));
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const dist = path.join(root, 'dist');
  let p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  let file = path.join(dist, p);
  if (!file.startsWith(dist)) file = path.join(dist, 'index.html');
  try {
    const st = await fs.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(dist, 'index.html');
  }
  const data = await fs.readFile(file);
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(data);
}

let vite: any = null;
if (!PREVIEW) {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
}

http
  .createServer((req, res) => {
    if (req.url?.startsWith('/api/')) return handleApi(req, res);
    if (vite) return vite.middlewares(req, res);
    serveStatic(req, res).catch(() => { res.writeHead(500); res.end(); });
  })
  .listen(PORT, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
    console.log(`\nFlyNotes ${PREVIEW ? '' : '(desenvolvimento) '}a funcionar.`);
    console.log(`  Neste computador:       http://localhost:${PORT}`);
    if (lan) console.log(`  Na mesma rede Wi-Fi:    http://${lan}:${PORT}`);
    if (firstRun) console.log(`\n  Foi criada uma password para si:  ${process.env.FLYNOTES_PASSWORD}\n  Fica guardada no ficheiro .env desta pasta. Pode mudá-la depois em Definições → Password.`);
    else if (!process.env.FLYNOTES_PASSWORD) console.log('\n  ATENÇÃO: não há password definida. Acrescente FLYNOTES_PASSWORD=... ao ficheiro .env.');
    console.log('\n  Para parar: Ctrl+C. Os dados ficam na pasta .data');
  });
