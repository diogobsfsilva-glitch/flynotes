// Núcleo do servidor local: configuração (.env), rotas /api/* e ficheiros estáticos.
// Usado pelo servidor de linha de comandos (server/dev.ts) e pela aplicação de ambiente de trabalho (desktop/).
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { promises as fs, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

type Handlers = Record<string, ((req: Request) => Response | Promise<Response>) | undefined>;

/** Lê (ou cria, no primeiro arranque) o ficheiro de configuração com a password e o segredo das sessões. */
export function loadConfig(envFile: string): { firstRun: boolean } {
  let firstRun = false;
  if (!existsSync(envFile) && !process.env.FLYNOTES_PASSWORD) {
    const words = () => randomBytes(3).toString('hex');
    mkdirSync(path.dirname(envFile), { recursive: true });
    writeFileSync(envFile, `# Configuração local da FlyNotes (não partilhe este ficheiro)\nFLYNOTES_PASSWORD=${words()}-${words()}-${words()}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\n`);
    firstRun = true;
  }
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { firstRun };
}

/** As rotas são importadas só depois de a configuração estar carregada (leem variáveis de ambiente). */
async function loadRoutes(): Promise<Record<string, Handlers>> {
  const [backup, blobUpload, calendar, clip, clipper, cron, file, login, passkey, password, push, sync] = await Promise.all([
    import('../api/backup.js'), import('../api/blob-upload.js'), import('../api/calendar.js'), import('../api/clip.js'),
    import('../api/clipper.js'), import('../api/cron.js'), import('../api/file.js'), import('../api/login.js'),
    import('../api/passkey.js'), import('../api/password.js'), import('../api/push.js'), import('../api/sync.js'),
  ]);
  return { backup, 'blob-upload': blobUpload, calendar, clip, clipper, cron, file, login, passkey, password, push, sync } as any;
}

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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.zip': 'application/zip',
};

export interface ServerOptions {
  port: number;
  /** Endereço onde escutar: omitido = todas as interfaces (acessível na rede local); '127.0.0.1' = só este computador. */
  host?: string;
  /** Pasta com a aplicação já construída (dist). Ignorada se `fallback` tratar dos pedidos (modo de desenvolvimento). */
  webDir?: string;
  /** Tratamento dos pedidos que não são /api/* (ex.: Vite em desenvolvimento). */
  fallback?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

export async function startServer(opts: ServerOptions): Promise<http.Server> {
  const routes = await loadRoutes();

  const handleApi = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const name = new URL(req.url!, 'http://x').pathname.replace(/^\/api\//, '').replace(/\/$/, '');
    const mod = routes[name];
    if (!mod) return sendResponse(res, new Response('not found', { status: 404 }));
    const fn = mod[req.method || 'GET'];
    if (!fn) return sendResponse(res, new Response('method not allowed', { status: 405 }));
    try {
      await sendResponse(res, await fn(await toRequest(req)));
    } catch (e: any) {
      console.error(e);
      if (!res.headersSent) sendResponse(res, new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 }));
      else res.end();
    }
  };

  const serveStatic = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const dist = path.resolve(opts.webDir!);
    const p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
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
  };

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/')) return void handleApi(req, res);
    if (opts.fallback) return opts.fallback(req, res);
    serveStatic(req, res).catch(() => { res.writeHead(500); res.end(); });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  return server;
}
