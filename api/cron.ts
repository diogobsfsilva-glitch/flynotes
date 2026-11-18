// Tarefas agendadas.
//  - Vercel Cron (diário): cópia de segurança + resumo da manhã + verificação de lembretes.
//  - Serviço externo (ex.: cron-job.org, a cada minuto): /api/cron?job=tick&key=CRON_SECRET para lembretes à hora exata.
import { json, safeEqual } from './_lib/auth.js';
import { createBackup, purgeDeletedFiles } from './_lib/backup.js';
import { tick, morningSummary } from './_lib/push.js';

function allowed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  const key = new URL(req.url).searchParams.get('key');
  return (!!auth && safeEqual(auth, `Bearer ${secret}`)) || (!!key && safeEqual(key, secret));
}

export async function GET(req: Request) {
  if (!allowed(req)) return json({ error: 'unauthorized' }, { status: 401 });
  const job = new URL(req.url).searchParams.get('job') || 'daily';
  const out: Record<string, unknown> = {};
  try {
    if (job === 'daily') {
      out.backup = await createBackup('auto').catch((e) => ({ error: String(e?.message || e) }));
      out.morning = await morningSummary().catch((e) => ({ error: String(e?.message || e) }));
      out.files = await purgeDeletedFiles().catch((e) => ({ error: String(e?.message || e) }));
    }
    out.tick = await tick().catch((e) => ({ error: String(e?.message || e) }));
  } catch (e: any) {
    return json({ error: String(e?.message || e), ...out }, { status: 500 });
  }
  return json(out);
}
