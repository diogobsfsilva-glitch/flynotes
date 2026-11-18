// Armazenamento de anexos: Vercel Blob (privado) em produção, sistema de ficheiros em desenvolvimento.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const localDir = () => path.join(process.env.FLYNOTES_DATA_DIR || '.data', 'files');

function safeId(id: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('invalid id');
  return id;
}

export async function saveFile(id: string, body: ArrayBuffer | Uint8Array, contentType: string) {
  safeId(id);
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    await put(`files/${id}`, Buffer.from(body as ArrayBuffer), {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(localDir(), id), Buffer.from(body as ArrayBuffer));
  await fs.writeFile(path.join(localDir(), id + '.type'), contentType);
}

export async function readFile(id: string): Promise<{ stream: ReadableStream | Uint8Array; contentType: string; size?: number } | null> {
  safeId(id);
  if (useBlob()) {
    const { get } = await import('@vercel/blob');
    const r = await get(`files/${id}`, { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { stream: r.stream, contentType: r.blob.contentType || 'application/octet-stream', size: r.blob.size };
  }
  try {
    const buf = await fs.readFile(path.join(localDir(), id));
    const type = await fs.readFile(path.join(localDir(), id + '.type'), 'utf8').catch(() => 'application/octet-stream');
    return { stream: new Uint8Array(buf), contentType: type, size: buf.length };
  } catch {
    return null;
  }
}

export async function deleteFile(id: string) {
  safeId(id);
  if (useBlob()) {
    const { del } = await import('@vercel/blob');
    await del(`files/${id}`);
    return;
  }
  await fs.rm(path.join(localDir(), id), { force: true });
  await fs.rm(path.join(localDir(), id + '.type'), { force: true });
}

export const blobEnabled = useBlob;

// ---------- Objetos genéricos (cópias de segurança) ----------
const safePath = (p: string) => {
  if (!/^[A-Za-z0-9/_.-]{3,120}$/.test(p) || p.includes('..')) throw new Error('invalid path');
  return p;
};

export async function putObject(pathname: string, body: Uint8Array, contentType: string) {
  safePath(pathname);
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    await put(pathname, Buffer.from(body), { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const full = path.join(process.env.FLYNOTES_DATA_DIR || '.data', pathname);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

export async function getObject(pathname: string): Promise<Uint8Array | null> {
  safePath(pathname);
  if (useBlob()) {
    const { get } = await import('@vercel/blob');
    const r = await get(pathname, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return new Uint8Array(await new Response(r.stream as any).arrayBuffer());
  }
  try { return new Uint8Array(await fs.readFile(path.join(process.env.FLYNOTES_DATA_DIR || '.data', pathname))); } catch { return null; }
}

export async function listObjects(prefix: string): Promise<{ pathname: string; size: number; uploadedAt: number }[]> {
  safePath(prefix);
  if (useBlob()) {
    const { list } = await import('@vercel/blob');
    const out: { pathname: string; size: number; uploadedAt: number }[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      for (const b of r.blobs) out.push({ pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(process.env.FLYNOTES_DATA_DIR || '.data', prefix);
  try {
    const names = await fs.readdir(dir);
    return Promise.all(names.map(async (n) => { const st = await fs.stat(path.join(dir, n)); return { pathname: prefix.replace(/\/?$/, '/') + n, size: st.size, uploadedAt: st.mtimeMs }; }));
  } catch { return []; }
}

export async function deleteObject(pathname: string) {
  safePath(pathname);
  if (useBlob()) {
    const { del } = await import('@vercel/blob');
    await del(pathname);
    return;
  }
  await fs.rm(path.join(process.env.FLYNOTES_DATA_DIR || '.data', pathname), { force: true });
}
