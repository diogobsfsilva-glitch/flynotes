// Subscrição de notificações push do dispositivo atual.
import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { saveSubscription, removeSubscription, sendToAll } from './_lib/push.js';

export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  return json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'subscribe' && body.subscription?.endpoint) { await saveSubscription(body.subscription); return json({ ok: true }); }
    if (body.action === 'unsubscribe' && body.endpoint) { await removeSubscription(body.endpoint); return json({ ok: true }); }
    if (body.action === 'test') return json({ sent: await sendToAll({ title: 'FlyNotes', body: 'As notificações estão a funcionar ✅', url: '/#/settings', tag: 'test' }) });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 500 });
  }
  return json({ error: 'ação desconhecida' }, { status: 400 });
}
