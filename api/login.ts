import { verifyPassword, passwordConfigured, sessionCookie, clearCookie, isAuthed, json, clientIp } from './_lib/auth.js';
import { db } from './_lib/db.js';

// Limite de tentativas por endereço: 5 falhas em 15 minutos bloqueiam esse endereço durante 15 minutos.
// Cada tentativa é registada ANTES de verificar a password (numa só instrução), por isso pedidos em
// simultâneo não escapam à contagem. Não há bloqueio global: ninguém consegue impedir o dono de entrar
// a partir de outro endereço — sob ataque, as respostas apenas ficam mais lentas.
const WINDOW = 15 * 60 * 1000;
const PER_IP = 5;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ip = clientIp(req);
  let q;
  try { q = await db(); }
  catch (e: any) { return json({ error: String(e?.message || 'Base de dados indisponível') }, { status: 503 }); }
  if (!(await passwordConfigured())) return json({ error: 'A instalação ainda não tem password. Defina a variável FLYNOTES_PASSWORD (ver instruções de instalação) e volte a publicar.' }, { status: 503 });
  const now = Date.now();
  // 1.º regista a tentativa (fica gravada de imediato); 2.º conta — tentativas em simultâneo veem-se umas às outras.
  const ins = await q(`insert into login_fails (ip, ts) values ($1, $2) returning id`, [ip, now]);
  const id = ins[0].id;
  const rows = await q(
    `select (select count(*)::int from login_fails where ip = $1 and ts > $2) as mine,
            (select min(ts) from login_fails where ip = $1 and ts > $2) as first,
            (select count(*)::int from login_fails where ts > $3) as total`,
    [ip, now - WINDOW, now - 60 * 60 * 1000],
  );
  const { mine, first, total } = rows[0] as { mine: number; first: number | null; total: number };
  if (mine > PER_IP) {
    // Esta tentativa não conta (senão o bloqueio nunca terminava enquanto alguém insistisse)
    await q(`delete from login_fails where id = $1`, [id]);
    const min = Math.max(1, Math.ceil((Number(first) + WINDOW - now) / 60000));
    return json({ error: `Demasiadas tentativas. Tente de novo dentro de ${min} min ou entre com Face ID.` }, { status: 429 });
  }
  // Sob ataque (muitas falhas na última hora, de quaisquer endereços) todas as respostas abrandam
  if (total > 30) await new Promise((r) => setTimeout(r, 2000));
  if (!(await verifyPassword(body?.password || ''))) {
    await new Promise((r) => setTimeout(r, 700));
    if (Math.random() < 0.05) await q(`delete from login_fails where ts < $1`, [now - 24 * 3600000]);
    const left = PER_IP - mine;
    return json({ error: left > 0 ? `Password incorreta (${left} tentativa${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''})` : 'Password incorreta. Login bloqueado durante 15 min.' }, { status: 401 });
  }
  await q(`delete from login_fails where ip = $1`, [ip]);
  return json({ ok: true }, { headers: { 'set-cookie': sessionCookie() } });
}

export async function DELETE() {
  return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
}

export async function GET(req: Request) {
  return json({ authed: isAuthed(req) }, { status: isAuthed(req) ? 200 : 401 });
}
