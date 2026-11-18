// Entrar com chave de acesso (Face ID, Touch ID, Windows Hello, impressão digital).
import { isAuthed, json, unauthorized, sessionCookie, sign, safeEqual } from './_lib/auth.js';
import { db } from './_lib/db.js';

const CHAL = 'fn_chal';

function rp(req: Request) {
  const origin = req.headers.get('origin') || `https://${req.headers.get('host')}`;
  const host = new URL(origin).hostname;
  return { rpID: host, origin };
}
function setChallenge(challenge: string) {
  const payload = Buffer.from(JSON.stringify({ c: challenge, t: Date.now() })).toString('base64url');
  return `${CHAL}=${payload}.${sign(payload)}; Path=/api/passkey; HttpOnly; SameSite=Strict; Max-Age=300${process.env.VERCEL ? '; Secure' : ''}`;
}
function getChallenge(req: Request): string | null {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${CHAL}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
  const { c, t } = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return Date.now() - t < 300000 ? c : null;
}

async function creds() {
  const q = await db();
  return (await q(`select id, data, created_at from auth_creds order by created_at`)).map((r) => ({ id: r.id, ...r.data, createdAt: Number(r.created_at) }));
}

export async function GET(req: Request) {
  // Indica se existem chaves registadas (para mostrar o botão no ecrã de entrada)
  const list = await creds();
  if (!isAuthed(req)) return json({ available: list.length > 0 });
  return json({ available: list.length > 0, credentials: list.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt })) });
}

export async function POST(req: Request) {
  const sw = await import('@simplewebauthn/server');
  const body = await req.json().catch(() => ({}));
  const { rpID, origin } = rp(req);
  try {
    if (body.action === 'register-options') {
      if (!isAuthed(req)) return unauthorized();
      const existing = await creds();
      const options = await sw.generateRegistrationOptions({
        rpName: 'FlyNotes', rpID, userName: 'flynotes', userDisplayName: 'FlyNotes',
        attestationType: 'none',
        excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      });
      return json(options, { headers: { 'set-cookie': setChallenge(options.challenge) } });
    }
    if (body.action === 'register-verify') {
      if (!isAuthed(req)) return unauthorized();
      const expectedChallenge = getChallenge(req);
      if (!expectedChallenge) return json({ error: 'Pedido expirado, tente de novo' }, { status: 400 });
      const v = await sw.verifyRegistrationResponse({ response: body.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return json({ error: 'Não foi possível verificar' }, { status: 400 });
      const c = v.registrationInfo.credential;
      const q = await db();
      await q(`insert into auth_creds (id, data, created_at) values ($1, $2::jsonb, $3) on conflict (id) do nothing`, [c.id, JSON.stringify({
        publicKey: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports || [], name: String(body.name || 'Dispositivo').slice(0, 60),
      }), Date.now()]);
      return json({ ok: true });
    }
    if (body.action === 'login-options') {
      const list = await creds();
      if (!list.length) return json({ error: 'Nenhuma chave registada' }, { status: 400 });
      const options = await sw.generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: list.map((c) => ({ id: c.id, transports: c.transports })) });
      return json(options, { headers: { 'set-cookie': setChallenge(options.challenge) } });
    }
    if (body.action === 'login-verify') {
      const expectedChallenge = getChallenge(req);
      if (!expectedChallenge) return json({ error: 'Pedido expirado, tente de novo' }, { status: 400 });
      const list = await creds();
      const c = list.find((x) => x.id === body.response?.id);
      if (!c) return json({ error: 'Chave desconhecida' }, { status: 400 });
      const v = await sw.verifyAuthenticationResponse({
        response: body.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: c.id, publicKey: new Uint8Array(Buffer.from(c.publicKey, 'base64url')), counter: c.counter, transports: c.transports },
      });
      if (!v.verified) { await new Promise((r) => setTimeout(r, 700)); return json({ error: 'Não foi possível verificar' }, { status: 401 }); }
      const q = await db();
      await q(`update auth_creds set data = jsonb_set(data, '{counter}', to_jsonb($2::bigint)) where id = $1`, [c.id, v.authenticationInfo.newCounter]);
      return json({ ok: true }, { headers: { 'set-cookie': sessionCookie() } });
    }
    if (body.action === 'delete') {
      if (!isAuthed(req)) return unauthorized();
      const q = await db();
      await q(`delete from auth_creds where id = $1`, [String(body.id)]);
      return json({ ok: true });
    }
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 400 });
  }
  return json({ error: 'ação desconhecida' }, { status: 400 });
}
