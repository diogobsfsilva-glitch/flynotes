// Cópias de segurança: listar, criar, descarregar e restaurar.
import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { createBackup, listBackups, restoreBackup } from './_lib/backup.js';
import { getObject } from './_lib/storage.js';

export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const url = new URL(req.url);
  const name = url.searchParams.get('download');
  if (name) {
    if (!name.startsWith('backups/')) return json({ error: 'inválido' }, { status: 400 });
    const data = await getObject(name);
    if (!data) return json({ error: 'não encontrado' }, { status: 404 });
    return new Response(data as any, { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${name.split('/').pop()}"` } });
  }
  return json({ backups: await listBackups() });
}

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'create') return json(await createBackup('manual'));
    if (body.action === 'restore' && typeof body.name === 'string') return json(await restoreBackup(body.name));
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
  return json({ error: 'ação desconhecida' }, { status: 400 });
}
