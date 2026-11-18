import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { pullSince, pushDocs, stats, type DocIn } from './_lib/db.js';

const TYPES = new Set(['note', 'notebook', 'tag', 'task', 'file', 'search', 'template', 'version', 'kv', 'event']);

export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const url = new URL(req.url);
  if (url.searchParams.get('stats')) return json({ stats: await stats() });
  const since = Number(url.searchParams.get('since') || 0) || 0;
  return json(await pullSince(since));
}

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  const docs: DocIn[] = Array.isArray(body?.docs) ? body.docs : [];
  const valid = docs.filter(
    (d) => d && typeof d.id === 'string' && d.id.length <= 80 && TYPES.has(d.type) && Number.isFinite(d.updatedAt),
  );
  if (valid.length !== docs.length) return json({ error: 'documentos inválidos' }, { status: 400 });
  return json(await pushDocs(valid));
}
