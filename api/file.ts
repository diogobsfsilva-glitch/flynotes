import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { saveFile, readFile, deleteFile } from './_lib/storage.js';

// GET /api/file?id=...  -> devolve o anexo
// PUT /api/file?id=...  -> carrega o anexo (corpo binário, até ~4 MB)
// DELETE /api/file?id=... -> apaga o anexo
export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const f = await readFile(id).catch(() => null);
  if (!f) return json({ error: 'não encontrado' }, { status: 404 });
  const headers: Record<string, string> = {
    'content-type': f.contentType,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  const name = url.searchParams.get('name');
  if (url.searchParams.get('download')) headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(name || id)}`;
  if (f.size) headers['content-length'] = String(f.size);
  return new Response(f.stream as any, { headers });
}

export async function PUT(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id') || '';
  const type = req.headers.get('content-type') || 'application/octet-stream';
  const buf = await req.arrayBuffer();
  try {
    await saveFile(id, buf, type);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 400 });
  }
  return json({ ok: true, size: buf.byteLength });
}

export async function DELETE(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id') || '';
  await deleteFile(id).catch(() => {});
  return json({ ok: true });
}
