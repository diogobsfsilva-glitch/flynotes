// Autenticação de utilizador único: password definida na variável FLYNOTES_PASSWORD.
import { createHmac, createHash, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';
import { getMetaValue, setMetaValue } from './db.js';

const COOKIE = 'fn_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 dias

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  const pw = process.env.FLYNOTES_PASSWORD || 'flynotes-dev';
  return createHash('sha256').update('fn-secret:' + pw).digest('hex');
}

export function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function checkPassword(input: string): boolean {
  // Sem password predefinida: tem de estar definida em FLYNOTES_PASSWORD (o servidor local gera uma no primeiro arranque)
  const expected = process.env.FLYNOTES_PASSWORD || '';
  if (!expected) return false;
  const a = createHash('sha256').update(String(input)).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------- Password alterada na aplicação (Definições → Alterar password) ----------
// Fica guardada na base de dados só como resumo criptográfico (scrypt + sal); a password em si nunca é guardada.
// Enquanto não for alterada na aplicação, vale a password definida na variável FLYNOTES_PASSWORD.
type StoredPassword = { salt: string; hash: string; changedAt: number };
const scrypt = (pw: string, salt: Buffer) => scryptSync(pw.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });

export async function verifyPassword(input: string): Promise<boolean> {
  const stored = await getMetaValue<StoredPassword | null>('password_hash', null);
  if (!stored?.hash) return checkPassword(input);
  const got = scrypt(String(input), Buffer.from(stored.salt, 'base64'));
  const want = Buffer.from(stored.hash, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Há alguma password definida (na aplicação ou na variável FLYNOTES_PASSWORD)? */
export async function passwordConfigured(): Promise<boolean> {
  if (process.env.FLYNOTES_PASSWORD) return true;
  return !!(await getMetaValue<StoredPassword | null>('password_hash', null))?.hash;
}

export async function storePassword(next: string) {
  const salt = randomBytes(16);
  await setMetaValue('password_hash', { salt: salt.toString('base64'), hash: scrypt(next, salt).toString('base64'), changedAt: Date.now() } satisfies StoredPassword);
}

export function isDev() {
  return !process.env.VERCEL;
}

export function sessionCookie(): string {
  const payload = Buffer.from(JSON.stringify({ u: 'owner', iat: Date.now() })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const secure = isDev() ? '' : ' Secure;';
  return `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAuthed(req: Request): boolean {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  // Sessões expiram também no servidor (não só no cookie)
  try {
    const { iat } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof iat === 'number' && Date.now() - iat < MAX_AGE * 1000;
  } catch {
    return false;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
  });
}

export function unauthorized(): Response {
  return json({ error: 'unauthorized' }, { status: 401 });
}

/** Compara segredos em tempo constante (CRON_SECRET, assinaturas). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
