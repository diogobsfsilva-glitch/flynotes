// Lê um calendário iCal (Google, Outlook, iCloud…) e devolve os eventos de um intervalo.
import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { expandIcs } from './_lib/ics.js';
import { safeFetch, BlockedUrlError } from './_lib/safeFetch.js';

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const { url, from, to } = await req.json().catch(() => ({}));
  let target: URL;
  try {
    target = new URL(String(url).replace(/^webcal:/i, 'https:'));
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    return json({ error: 'Endereço de calendário inválido' }, { status: 400 });
  }
  try {
    // Em desenvolvimento local permite endereços internos (testes); em produção não.
    const { response: r } = await safeFetch(target, { headers: { accept: 'text/calendar,*/*', 'user-agent': 'FlyNotes Calendar' }, signal: AbortSignal.timeout(15000) }, { allowPrivate: !process.env.VERCEL });
    if (!r.ok) return json({ error: `O calendário respondeu ${r.status}` }, { status: 502 });
    const text = await r.text();
    if (!text.includes('BEGIN:VCALENDAR')) return json({ error: 'O endereço não é um calendário iCal (.ics)' }, { status: 400 });
    const name = text.match(/X-WR-CALNAME:(.+)/)?.[1]?.trim();
    const events = expandIcs(text, Number(from) || Date.now() - 90 * 86400000, Number(to) || Date.now() + 365 * 86400000);
    return json({ name, events }, { headers: { 'cache-control': 'private, max-age=300' } });
  } catch (e: any) {
    if (e instanceof BlockedUrlError) return json({ error: e.message }, { status: 400 });
    return json({ error: 'Não foi possível obter o calendário' }, { status: 502 });
  }
}
