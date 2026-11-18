// Ativar notificações push neste dispositivo.
const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) || null;
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? 'No iPhone, instale primeiro a FlyNotes no ecrã principal (Partilhar → Adicionar ao ecrã principal) e abra-a a partir do ícone.' : 'Este browser não suporta notificações push.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('As notificações foram bloqueadas. Autorize-as nas definições do browser.');
  const { publicKey } = await (await fetch('/api/push')).json();
  if (!publicKey) throw new Error('O servidor ainda não tem as chaves de notificação configuradas.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }) });
  if (!r.ok) throw new Error((await r.json()).error || 'Erro ao registar');
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

export async function testPush() {
  const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test' }) });
  return (await r.json()).sent as number;
}
