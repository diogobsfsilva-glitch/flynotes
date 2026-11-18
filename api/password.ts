// Alterar a password de acesso (utilizador com sessão iniciada).
import { isAuthed, json, unauthorized, verifyPassword, storePassword, clientIp } from './_lib/auth.js';
import { db } from './_lib/db.js';

const WINDOW = 15 * 60 * 1000;
const MAX_TRIES = 5;

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const current = String(body?.current || '');
  const next = String(body?.next || '');
  if (next.length < 10) return json({ error: 'A nova password deve ter pelo menos 10 caracteres.' }, { status: 400 });
  if (next.length > 200) return json({ error: 'A nova password é demasiado longa.' }, { status: 400 });
  if (next === current) return json({ error: 'A nova password é igual à atual.' }, { status: 400 });
  // Mesmo limite de tentativas do login: alguém com o dispositivo desbloqueado não pode adivinhar a password atual
  const q = await db();
  const now = Date.now();
  const key = 'pw:' + clientIp(req);
  const ins = await q(`insert into login_fails (ip, ts) values ($1, $2) returning id`, [key, now]);
  const tries = await q(`select count(*)::int as n from login_fails where ip = $1 and ts > $2`, [key, now - WINDOW]);
  if (tries[0].n > MAX_TRIES) {
    await q(`delete from login_fails where id = $1`, [ins[0].id]);
    return json({ error: 'Demasiadas tentativas. Tente de novo dentro de 15 minutos.' }, { status: 429 });
  }
  if (!(await verifyPassword(current))) {
    await new Promise((r) => setTimeout(r, 700));
    return json({ error: 'A password atual não está correta.' }, { status: 403 });
  }
  await storePassword(next);
  await q(`delete from login_fails where ip = $1`, [key]);
  return json({ ok: true });
}
