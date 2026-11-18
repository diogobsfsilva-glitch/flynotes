// Notificações push (Web Push / VAPID): lembretes de notas, tarefas e eventos mesmo com a app fechada.
import { db, getMetaValue, setMetaValue } from './db.js';

async function webpush() {
  const wp = (await import('web-push')).default;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID não configurado');
  wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:flynotes@example.com', pub, priv);
  return wp;
}

export async function saveSubscription(sub: any) {
  const q = await db();
  await q(`insert into push_subs (endpoint, data, created_at) values ($1, $2::jsonb, $3) on conflict (endpoint) do update set data = excluded.data`, [sub.endpoint, JSON.stringify(sub), Date.now()]);
}
export async function removeSubscription(endpoint: string) {
  const q = await db();
  await q(`delete from push_subs where endpoint = $1`, [endpoint]);
}

export async function sendToAll(payload: { title: string; body: string; url?: string; tag?: string }) {
  const wp = await webpush();
  const q = await db();
  const subs = await q(`select endpoint, data from push_subs`);
  let sent = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification(s.data, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await removeSubscription(s.endpoint);
    }
  }
  return sent;
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });

/** Envia os lembretes cujo momento chegou desde a última verificação (no máximo 3 horas atrás). */
export async function tick() {
  const q = await db();
  const now = Date.now();
  // Janela fixa das últimas 3 horas; a tabela push_sent evita repetições. Assim um lembrete que chegue
  // tarde ao servidor (criado offline) ou cujo envio falhou é enviado na verificação seguinte.
  const last = now - 3 * 3600000;
  const subs = await q(`select count(*)::int as n from push_subs`);
  if (!subs[0]?.n) return { checked: 0, sent: 0 };
  const due: { key: string; title: string; body: string; url: string }[] = [];
  const notes = await q(`select id, data from docs where type = 'note' and not deleted and (data->>'reminderAt') is not null and (data->>'reminderAt')::bigint > $1 and (data->>'reminderAt')::bigint <= $2`, [last, now]);
  for (const n of notes) if (!Number(n.data.reminderDone) && !Number(n.data.trashed)) due.push({ key: `n:${n.id}:${n.data.reminderAt}`, title: n.data.title || 'Lembrete', body: 'Lembrete de nota', url: `/#/note/${n.id}` });
  const tasks = await q(`select id, data from docs where type = 'task' and not deleted and coalesce((data->>'done')::int, 0) = 0 and coalesce((data->>'reminderAt')::bigint, (data->>'due')::bigint) > $1 and coalesce((data->>'reminderAt')::bigint, (data->>'due')::bigint) <= $2`, [last, now]);
  for (const t of tasks) due.push({ key: `t:${t.id}:${t.data.reminderAt || t.data.due}`, title: t.data.title || 'Tarefa', body: t.data.reminderAt ? 'Lembrete de tarefa' : 'Prazo da tarefa', url: '/#/tasks' });
  const events = await q(`select id, data from docs where type = 'event' and not deleted and (data->>'reminderMin') is not null and ((data->>'start')::bigint - (data->>'reminderMin')::bigint * 60000) > $1 and ((data->>'start')::bigint - (data->>'reminderMin')::bigint * 60000) <= $2`, [last, now]);
  for (const e of events) due.push({ key: `e:${e.id}:${e.data.start}`, title: e.data.title || 'Evento', body: `${fmtTime(Number(e.data.start))}${e.data.location ? ' · ' + e.data.location : ''}`, url: `/#/calendar?d=${new Date(Number(e.data.start)).toISOString().slice(0, 10)}` });
  let sent = 0;
  for (const d of due) {
    const ins = await q(`insert into push_sent (key, sent_at) values ($1, $2) on conflict do nothing returning key`, [d.key, now]);
    if (!ins.length) continue;
    let ok = 0;
    try { ok = await sendToAll({ title: d.title, body: d.body, url: d.url, tag: d.key }); } catch { ok = 0; }
    // Nenhum dispositivo recebeu: liberta a marca para tentar de novo na próxima verificação
    if (!ok) await q(`delete from push_sent where key = $1`, [d.key]);
    sent += ok;
  }
  await q(`delete from push_sent where sent_at < $1`, [now - 30 * 86400000]);
  return { checked: due.length, sent };
}

/** Resumo da manhã: tarefas, eventos e lembretes do dia. */
export async function morningSummary() {
  const q = await db();
  const tz = 'Europe/Lisbon';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const start = Date.parse(today + 'T00:00:00Z') - 3600000 * 2, end = start + 86400000 + 3600000 * 4;
  const inDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz }) === today;
  const tasks = (await q(`select data from docs where type = 'task' and not deleted and coalesce((data->>'done')::int,0) = 0 and (data->>'due')::bigint between $1 and $2`, [start, end])).filter((r) => inDay(Number(r.data.due)));
  const overdue = await q(`select count(*)::int as n from docs where type = 'task' and not deleted and coalesce((data->>'done')::int,0) = 0 and (data->>'due')::bigint < $1`, [start]);
  const events = (await q(`select data from docs where type = 'event' and not deleted and (data->>'start')::bigint between $1 and $2`, [start, end])).filter((r) => inDay(Number(r.data.start)));
  const rem = (await q(`select data from docs where type = 'note' and not deleted and (data->>'reminderAt')::bigint between $1 and $2`, [start, end])).filter((r) => inDay(Number(r.data.reminderAt)) && !Number(r.data.reminderDone));
  const parts = [];
  if (events.length) parts.push(`${events.length} evento(s): ${events.slice(0, 3).map((e) => `${fmtTime(Number(e.data.start))} ${e.data.title}`).join(', ')}`);
  if (tasks.length) parts.push(`${tasks.length} tarefa(s) para hoje`);
  if (overdue[0]?.n) parts.push(`${overdue[0].n} em atraso`);
  if (rem.length) parts.push(`${rem.length} lembrete(s)`);
  if (!parts.length) return { sent: 0 };
  return { sent: await sendToAll({ title: 'Bom dia! O seu dia na FlyNotes', body: parts.join(' · '), url: '/#/calendar', tag: 'morning-' + today }) };
}
